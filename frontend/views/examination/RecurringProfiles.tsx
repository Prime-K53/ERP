import React, { useState, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { ExaminationRecurringProfile, ExaminationJob, ExaminationInvoiceGroup } from '../../types';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { toast } from '../../components/Toast';
import { 
  Calendar, Repeat, Play, Pause, Trash2, Eye, 
  Clock, Users,
  Plus, RefreshCw, TrendingUp, CalendarDays
} from 'lucide-react';
import { ConfirmDialog, useConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const RecurringProfiles: React.FC = () => {
  const navigate = useNavigate();
  const { 
    recurringProfiles, jobs, groups, loading, jobLoading,
    createRecurringProfile, pauseRecurringProfile, resumeRecurringProfile, deleteRecurringProfile, runRecurringBilling 
  } = useExamination();

  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [sourceType, setSourceType] = useState<'job' | 'group'>('job');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'termly'>('monthly');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRunningBilling, setIsRunningBilling] = useState(false);
  const [actionProfileId, setActionProfileId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  // Load default start date
  useEffect(() => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    setStartDate(nextMonth.toISOString().split('T')[0]);
  }, []);

  const availableSources = sourceType === 'job' 
    ? jobs.filter(j => j.status === 'Invoiced')
    : groups.filter(g => g.status === 'Invoiced');

  const getDisplayName = (sourceType: 'job' | 'group', id: string) => {
    if (sourceType === 'job') {
      const job = jobs.find(j => j.id === id);
      return job ? `${job.exam_name} - ${job.class_name}` : 'Unknown Job';
    } else {
      const group = groups.find(g => g.id === id);
      return group ? `Group: ${group.school_id}` : 'Unknown Group';
    }
  };

  const getFrequencyLabel = (freq: string) => {
    switch (freq) {
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      case 'termly': return 'Termly';
      default: return freq;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-700';
      case 'Paused': return 'bg-yellow-100 text-yellow-700';
      case 'Expired': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const handleCreateProfile = async () => {
    if (!selectedSourceId) {
      toast.error('Please select a source job or group');
      return;
    }

    if (!startDate) {
      toast.error('Please select a start date');
      return;
    }

    setIsCreating(true);
    try {
      const payload = {
        frequency,
        start_date: startDate,
        end_date: endDate || undefined,
        auto_generate: autoGenerate
      };

      await createRecurringProfile(sourceType, selectedSourceId, payload);
      toast.success('Recurring profile created successfully');
      
      // Reset form
      setSelectedSourceId('');
      setSourceType('job');
      setFrequency('monthly');
      const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
      setStartDate(nextMonth.toISOString().split('T')[0]);
      setEndDate('');
      setAutoGenerate(true);
    } catch (error) {
      logger.error('Error creating recurring profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create recurring profile');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRunBilling = async () => {
    setIsRunningBilling(true);
    try {
      const result = await runRecurringBilling();
      if (result.processed_profiles > 0) {
        toast.success(`Processed ${result.processed_profiles} profiles, generated ${result.generated_invoices} invoices`);
      } else {
        toast.info('No recurring profiles to process');
      }
      
      if (result.errors.length > 0) {
        logger.error('Recurring billing errors:', result.errors);
      }
    } catch (error) {
      logger.error('Error running recurring billing:', error);
      toast.error('Failed to run recurring billing');
    } finally {
      setIsRunningBilling(false);
    }
  };

  const handlePauseProfile = async (profileId: string) => {
    setActionProfileId(profileId);
    try {
      await pauseRecurringProfile(profileId);
      toast.success('Recurring profile paused');
    } catch (error) {
      logger.error('Error pausing recurring profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to pause recurring profile');
    } finally {
      setActionProfileId(null);
    }
  };

  const handleResumeProfile = async (profileId: string) => {
    setActionProfileId(profileId);
    try {
      const profile = await resumeRecurringProfile(profileId);
      if (profile.status === 'Expired') {
        toast.error('Profile has already expired and cannot be resumed.');
        return;
      }
      toast.success('Recurring profile resumed');
    } catch (error) {
      logger.error('Error resuming recurring profile:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to resume recurring profile');
    } finally {
      setActionProfileId(null);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Recurring Profile',
      message: 'Delete this recurring profile? This action cannot be undone.',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: () => {
        setActionProfileId(profileId);
        deleteRecurringProfile(profileId).then(() => {
          toast.success('Recurring profile deleted');
        }).catch((error) => {
          logger.error('Error deleting recurring profile:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to delete recurring profile');
        }).finally(() => {
          setActionProfileId(null);
        });
      }
    });
  };

  const calculateNextRun = (profile: ExaminationRecurringProfile) => {
    const nextRun = new Date(profile.next_run_date);
    const now = new Date();
    
    if (nextRun < now) {
      return 'Overdue';
    }
    
    const diffTime = nextRun.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  function handleViewSource(sourceType: string, sourceId: string) {
    if (sourceType === 'job') {
      navigate(`/examination/jobs/${sourceId}`);
    } else {
      navigate(`/examination/groups?group=${sourceId}`);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Recurring Billing Profiles
          </h1>
          <p className="text-gray-600 mt-1">Manage automated recurring billing for schools</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={handleRunBilling}
            disabled={isRunningBilling || jobLoading}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRunningBilling ? 'animate-spin' : ''}`} />
            <span>{isRunningBilling ? 'Running...' : 'Run Billing'}</span>
          </Button>
          <Button
            onClick={handleCreateProfile}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            <span>Create Profile</span>
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Profiles</p>
                <p className="text-2xl font-bold">
                  {recurringProfiles.filter(p => p.status === 'Active').length}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Repeat className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Next Runs</p>
                <p className="text-2xl font-bold text-blue-600">
                  {recurringProfiles.filter(p => p.status === 'Active').length}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <CalendarDays className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Auto Generate</p>
                <p className="text-2xl font-bold text-purple-600">
                  {recurringProfiles.filter(p => p.auto_generate).length}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Plus className="h-5 w-5" />
            <span>Create Recurring Profile</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Type
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="job"
                    checked={sourceType === 'job'}
                    onChange={(e) => setSourceType(e.target.value as 'job')}
                    className="mr-2"
                  />
                  Job
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="group"
                    checked={sourceType === 'group'}
                    onChange={(e) => setSourceType(e.target.value as 'group')}
                    className="mr-2"
                  />
                  Group
                </label>
              </div>
            </div>

            <div>
              <Select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                label={`Select ${sourceType === 'job' ? 'Job' : 'Group'}`}
              >
                <option value="">Select a {sourceType === 'job' ? 'job' : 'group'}...</option>
                {availableSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {getDisplayName(sourceType, source.id)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly' | 'termly')}
                label="Frequency"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="termly">Termly</option>
              </Select>
            </div>
            <div>
              <Input
                type="date"
                label="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Input
                type="date"
                label="End Date (Optional)"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={(e) => setAutoGenerate(e.target.checked)}
                />
                <span className="text-sm text-gray-700">Auto Generate</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleCreateProfile}
              disabled={!selectedSourceId || !startDate || isCreating}
              className="flex items-center space-x-2"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Create Profile</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profiles List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recurring Profiles</span>
            <span className="text-sm text-gray-600">{recurringProfiles.length} total profiles</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recurringProfiles.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Repeat className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium">No recurring profiles yet</p>
              <p className="text-sm">Create a recurring profile to automate examination billing.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recurringProfiles.map((profile) => {
                const sourceName = getDisplayName(profile.source_type, profile.source_id);
                const nextRun = calculateNextRun(profile);
                
                return (
                  <div key={profile.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Badge className={getStatusColor(profile.status)}>
                          {profile.status}
                        </Badge>
                        <span className="font-semibold">{sourceName}</span>
                        <Badge variant="secondary">
                          {getFrequencyLabel(profile.frequency)}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        {profile.auto_generate && (
                          <Badge variant="outline" className="flex items-center space-x-1">
                            <TrendingUp className="h-3 w-3" />
                            <span>Auto</span>
                          </Badge>
                        )}
                        <span className="text-sm text-gray-600">
                          Next: {new Date(profile.next_run_date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>
                          {new Date(profile.start_date).toLocaleDateString()} - 
                          {profile.end_date ? new Date(profile.end_date).toLocaleDateString() : 'No end date'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-500" />
                        <span className={nextRun === 'Overdue' ? 'text-red-600 font-semibold' : ''}>
                          Next run: {nextRun}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-gray-500" />
                        <span>Source: {profile.source_type}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <span>Created: {new Date(profile.created_at).toLocaleDateString()}</span>
                        {profile.last_run_date && (
                          <span>| Last run: {new Date(profile.last_run_date).toLocaleDateString()}</span>
                        )}
                      </div>
                      
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewSource(profile.source_type, profile.source_id)}
                          className="flex items-center space-x-1"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View Source</span>
                        </Button>
                        
                        {profile.status === 'Active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePauseProfile(profile.id)}
                            disabled={actionProfileId === profile.id || jobLoading}
                            className="flex items-center space-x-1 text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                          >
                            <Pause className="h-3 w-3" />
                            <span>Pause</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResumeProfile(profile.id)}
                            disabled={actionProfileId === profile.id || jobLoading}
                            className="flex items-center space-x-1 text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <Play className="h-3 w-3" />
                            <span>Resume</span>
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteProfile(profile.id)}
                          disabled={actionProfileId === profile.id || jobLoading}
                          className="flex items-center space-x-1 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState(c => ({ ...c, open: false }));
        }}
        onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type={confirmState.type || 'danger'}
      />
    </div>
  );
};

export default RecurringProfiles;
