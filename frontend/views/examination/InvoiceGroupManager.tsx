import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { currencyService } from '../../services/currencyService';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useExamination } from '../../context/ExaminationContext';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { toast } from '../../components/Toast';
import { 
  Plus, DollarSign, Users, Calendar, Trash2, FileText, 
  ArrowLeft, Loader2, CheckCircle, AlertTriangle 
} from 'lucide-react';

const InvoiceGroupManager: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig } = useAuth();
  const { 
    groups, schools, jobs, loading, groupLoading,
    createGroup, addJobsToGroup, removeJobFromGroup, deleteGroup, generateInvoiceForGroup
  } = useExamination();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  // Load existing group if editing
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const groupId = urlParams.get('group');
    if (groupId) {
      setSelectedGroupId(groupId);
      const group = groups.find(g => g.id === groupId);
      if (group) {
        setSelectedSchoolId(group.school_id);
        setSelectedJobIds(group.jobs.map(j => j.examination_job_id));
      }
    }
  }, [groups]);

  const availableJobs = jobs.filter(job => 
    job.school_id === selectedSchoolId && 
    job.status !== 'Invoiced' && 
    !job.invoice_group_id &&
    !selectedJobIds.includes(job.id)
  );

  const selectedJobs = jobs.filter(job => selectedJobIds.includes(job.id));

  const getSchoolName = (schoolId: string) => {
    return schools.find(s => s.id === schoolId)?.name || 'Unknown School';
  };

  const handleCreateGroup = async () => {
    if (!selectedSchoolId) {
      toast.error('Please select a school');
      return;
    }

    if (selectedJobIds.length === 0) {
      toast.error('Please select at least one job');
      return;
    }

    setIsCreatingGroup(true);
    try {
      const result = await createGroup({
        school_id: selectedSchoolId,
        examination_job_ids: selectedJobIds
      });
      
      toast.success('Invoice group created successfully');
      setSelectedGroupId(result.id);
      setSelectedSchoolId(result.school_id);
      setSelectedJobIds(result.jobs.map((job) => job.examination_job_id));
    } catch (error) {
      logger.error('Error creating group:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create invoice group');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleAddJobs = async () => {
    if (!selectedGroupId) {
      toast.error('Please select or create a group first');
      return;
    }

    if (selectedJobIds.length === 0) {
      toast.error('Please select at least one job to add');
      return;
    }

    try {
      const result = await addJobsToGroup(selectedGroupId, selectedJobIds);
      toast.success('Jobs added to group successfully');
      setSelectedJobIds(result.jobs.map((job) => job.examination_job_id));
    } catch (error) {
      logger.error('Error adding jobs to group:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add jobs to group');
    }
  };

  const handleRemoveJob = async (jobId: string) => {
    if (!selectedGroupId) return;

    try {
      const result = await removeJobFromGroup(selectedGroupId, jobId);
      toast.success('Job removed from group successfully');
      setSelectedJobIds(result.jobs.map((job) => job.examination_job_id));
    } catch (error) {
      logger.error('Error removing job from group:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove job from group');
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;

    if (!confirm('Are you sure you want to delete this invoice group? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteGroup(selectedGroupId);
      toast.success('Invoice group deleted successfully');
      setSelectedGroupId('');
      setSelectedSchoolId('');
      setSelectedJobIds([]);
      navigate('/examination/batches');
    } catch (error) {
      logger.error('Error deleting group:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete invoice group');
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedGroupId) return;

    try {
      const result = await generateInvoiceForGroup(selectedGroupId);
      toast.success('Invoice generated successfully');
      navigate('/sales-flow/invoices', {
        state: {
          action: 'view',
          type: 'Invoice',
          id: result.invoice_id,
          filterInvoiceId: result.invoice_id,
          source: 'examination'
        }
      });
    } catch (error) {
      logger.error('Error generating invoice:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate invoice');
    }
  };

  const totalAmount = selectedJobs.reduce((sum, job) => sum + (job.final_amount || 0), 0);
  const totalLearners = selectedJobs.reduce((sum, job) => sum + job.number_of_learners, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/examination/batches')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Batches</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Invoice Group Manager
            </h1>
            {selectedGroupId && (
              <p className="text-sm text-gray-600">
                Managing group for {getSchoolName(selectedSchoolId)}
              </p>
            )}
          </div>
        </div>
        
        {selectedGroupId && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={handleDeleteGroup}
              className="flex items-center space-x-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete Group</span>
            </Button>
            
            <Button
              onClick={handleGenerateInvoice}
              disabled={selectedJobIds.length === 0}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
            >
              <FileText className="h-4 w-4" />
              <span>Generate Invoice</span>
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Group Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Plus className="h-5 w-5" />
              <span>Group Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Select
                label="Select School"
                value={selectedSchoolId}
                onChange={(e) => {
                  setSelectedSchoolId(e.target.value);
                  setSelectedJobIds([]);
                }}
                disabled={!!selectedGroupId}
              >
                <option value="">Select a school...</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </div>

            {selectedSchoolId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Available Jobs ({availableJobs.length})
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                  {availableJobs.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No available jobs for this school. All jobs are either invoiced or already in groups.
                    </p>
                  ) : (
                    availableJobs.map((job) => (
                      <label key={job.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(job.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedJobIds(prev => [...prev, job.id]);
                            } else {
                              setSelectedJobIds(prev => prev.filter(id => id !== job.id));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{job.class_name}</span>
                            <Badge variant="secondary">{job.status}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            {job.number_of_learners} learners | {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {job.final_amount?.toLocaleString()}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex space-x-2">
              {!selectedGroupId ? (
                <Button
                  onClick={handleCreateGroup}
                  disabled={!selectedSchoolId || selectedJobIds.length === 0 || isCreatingGroup}
                  className="flex items-center space-x-2"
                >
                  {isCreatingGroup ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Creating Group...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      <span>Create Group</span>
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleAddJobs}
                  disabled={selectedJobIds.length === 0}
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Selected Jobs</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Selected Jobs Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>Selected Jobs Summary</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>No jobs selected yet.</p>
                <p className="text-sm">Select a school and choose jobs to add to the group.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {selectedJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium">{job.class_name}</div>
                        <div className="text-sm text-gray-600">
                          {job.number_of_learners} learners | {job.status}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold">{currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {job.final_amount?.toLocaleString()}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveJob(job.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Jobs:</span>
                    <span className="font-medium">{selectedJobs.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Learners:</span>
                    <span className="font-medium">{totalLearners}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total Amount:</span>
                    <span>{currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {totalAmount.toLocaleString()}</span>
                  </div>
                </div>

                {selectedGroupId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Group Ready</span>
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      All selected jobs are from the same school and ready for invoicing.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Existing Groups */}
      {groups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Existing Groups</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => (
                <div key={group.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{getSchoolName(group.school_id)}</h3>
                    <Badge variant={group.status === 'Invoiced' ? 'success' : 'default'}>
                      {group.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {group.jobs.length} jobs | {currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || companyConfig?.currencySymbol || 'MWK'} {group.total_amount.toLocaleString()}
                  </div>
                  <div className="space-y-1 mb-3">
                    {group.jobs.slice(0, 3).map((job) => (
                      <div key={job.examination_job_id} className="text-xs text-gray-500">
                        - {jobs.find(j => j.id === job.examination_job_id)?.class_name || 'Unknown Class'}
                      </div>
                    ))}
                    {group.jobs.length > 3 && (
                      <div className="text-xs text-gray-500">
                        - +{group.jobs.length - 3} more jobs
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setSelectedSchoolId(group.school_id);
                        setSelectedJobIds(group.jobs.map((job) => job.examination_job_id));
                        navigate(`/examination/groups?group=${group.id}`);
                      }}
                    >
                      View Details
                    </Button>
                    {group.status !== 'Invoiced' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setSelectedSchoolId(group.school_id);
                          setSelectedJobIds(group.jobs.map(j => j.examination_job_id));
                        }}
                      >
                        Edit Group
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
};

export default InvoiceGroupManager;
