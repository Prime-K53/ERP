import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  CheckCircle,
  FileText,
  Layers,
  RefreshCw,
  Repeat,
  Save,
  School,
  Settings,
  UserRound
} from 'lucide-react';
import { api } from '../../services/api';
import {
  ExaminationAdjustmentType,
  ExaminationInvoiceGroup,
  ExaminationJob,
  ExaminationJobSubject,
  ExaminationRecurringProfile,
  ExaminationRoundingRuleType
} from '../../types';
import { useAuth } from '../../context/AuthContext';

type JobRow = ExaminationJob & { subjects: ExaminationJobSubject[] };
type EditingSubjectInput = {
  id?: string;
  subject_name: string;
  pages_per_paper: number;
  extra_copies: number;
};

type BomOption = {
  id: string;
  label: string;
  source: 'BOM' | 'Template';
};

type TabKey = 'jobs' | 'groups' | 'recurring' | 'reporting';

const roundCurrency = (value: number) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.round(safe * 100) / 100;
};

const buildGroupLineFromJob = (job: JobRow) => ({
  examination_job_id: job.id,
  class_name: job.class_name,
  learners: Math.max(0, Number(job.number_of_learners || 0)),
  price_per_learner: roundCurrency(Number(job.final_price_per_learner || 0)),
  amount: roundCurrency(Number(job.final_amount || 0))
});

const syncGroupsForJobMutation = (
  prevGroups: ExaminationInvoiceGroup[],
  nextJob: JobRow,
  previousGroupId?: string
) => {
  const targetGroupId = String(nextJob.invoice_group_id || '').trim();
  const previousId = String(previousGroupId || '').trim();

  return prevGroups.map((group) => {
    const groupId = String(group.id || '').trim();
    const existingLines = Array.isArray(group.jobs) ? group.jobs : [];
    const withoutJob = existingLines.filter((line) => line.examination_job_id !== nextJob.id);

    let nextLines = withoutJob;
    const shouldAddToGroup = Boolean(targetGroupId) && targetGroupId === groupId && group.status !== 'Invoiced';
    if (shouldAddToGroup) {
      nextLines = [...withoutJob, buildGroupLineFromJob(nextJob)];
    }

    const lineChanged = nextLines.length !== existingLines.length
      || nextLines.some((line, index) => {
        const current = existingLines[index];
        return !current
          || current.examination_job_id !== line.examination_job_id
          || Number(current.amount || 0) !== Number(line.amount || 0)
          || Number(current.price_per_learner || 0) !== Number(line.price_per_learner || 0)
          || Number(current.learners || 0) !== Number(line.learners || 0)
          || String(current.class_name || '') !== String(line.class_name || '');
      });

    const touchedGroup = groupId === targetGroupId || groupId === previousId
      || existingLines.some((line) => line.examination_job_id === nextJob.id);

    if (!lineChanged && !touchedGroup) {
      return group;
    }

    const totalAmount = roundCurrency(
      nextLines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
    );

    return {
      ...group,
      jobs: nextLines,
      total_amount: totalAmount,
      updated_at: touchedGroup ? new Date().toISOString() : group.updated_at
    };
  });
};

const formatMoney = (value?: number) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPercent = (value?: number) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const buildDefaultNewJobForm = () => ({
  exam_name: `New Examination ${new Date().toLocaleDateString()}`,
  school_id: '',
  class_name: '',
  number_of_learners: 1,
  bom_id: '',
  paper_material_id: '',
  toner_material_id: '',
  adjustment_type: 'fixed' as ExaminationAdjustmentType,
  adjustment_value: 0,
  rounding_rule_type: 'none' as ExaminationRoundingRuleType,
  rounding_value: 0,
  subject_name: 'Subject',
  pages_per_paper: 1,
  extra_copies: 0
});

const ExaminationPrintingV2: React.FC = () => {
  const { notify } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('jobs');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [groups, setGroups] = useState<ExaminationInvoiceGroup[]>([]);
  const [profiles, setProfiles] = useState<ExaminationRecurringProfile[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bomOptions, setBomOptions] = useState<BomOption[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [editingJob, setEditingJob] = useState<JobRow | null>(null);
  const [editingSubjects, setEditingSubjects] = useState<EditingSubjectInput[]>([]);
  const [dirty, setDirty] = useState(false);

  const [groupSchoolId, setGroupSchoolId] = useState('');
  const [selectedJobsForGroup, setSelectedJobsForGroup] = useState<string[]>([]);

  const [showNewJobPanel, setShowNewJobPanel] = useState(false);
  const [newJobForm, setNewJobForm] = useState(buildDefaultNewJobForm);

  const [recurringTarget, setRecurringTarget] = useState<{ type: 'job' | 'group'; id: string } | null>(null);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'monthly' | 'termly'>('monthly');
  const [recurringStart, setRecurringStart] = useState(new Date().toISOString().split('T')[0]);
  const [recurringEnd, setRecurringEnd] = useState('');
  const [recurringAuto, setRecurringAuto] = useState(true);

  const autosaveTimer = useRef<number | null>(null);
  const autosaveInFlightRef = useRef(false);
  const autosavePendingRef = useRef(false);
  const autosaveLastPayloadKeyRef = useRef<string>('');
  const latestEditingJobRef = useRef<JobRow | null>(null);
  const latestEditingSubjectsRef = useRef<EditingSubjectInput[]>([]);
  const editVersionRef = useRef(0);

  const selectedJob = useMemo(() => {
    return jobs.find(job => job.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const isReadOnly = useMemo(() => {
    return editingJob?.status === 'Approved' || editingJob?.status === 'Invoiced';
  }, [editingJob?.status]);

  const learnerCount = useMemo(() => {
    return Math.max(0, Number(editingJob?.number_of_learners || 0));
  }, [editingJob?.number_of_learners]);

  const subjectRowsPreview = useMemo(() => {
    return editingSubjects.map(subject => {
      const pages = Math.max(0, Number(subject.pages_per_paper || 0));
      const extra = Math.max(0, Number(subject.extra_copies || 0));
      const totalCopies = learnerCount + extra;
      return {
        ...subject,
        total_copies: totalCopies,
        total_pages: pages * totalCopies
      };
    });
  }, [editingSubjects, learnerCount]);

  const localTotalPages = useMemo(() => {
    return subjectRowsPreview.reduce((sum, row) => sum + row.total_pages, 0);
  }, [subjectRowsPreview]);

  const clearAutosaveTimer = () => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  };

  const buildAutosavePayload = (job: JobRow, subjects: EditingSubjectInput[]) => ({
    exam_name: job.exam_name,
    school_id: job.school_id,
    class_name: job.class_name,
    number_of_learners: job.number_of_learners,
    bom_id: job.bom_id,
    paper_material_id: job.paper_material_id,
    toner_material_id: job.toner_material_id,
    adjustment_type: job.adjustment_type,
    adjustment_value: job.adjustment_value,
    rounding_rule_type: job.rounding_rule_type,
    rounding_value: job.rounding_value,
    override_enabled: job.override_enabled,
    manual_price_per_learner: job.manual_price_per_learner,
    override_reason: job.override_reason,
    subjects: subjects.map((subject) => ({
      id: subject.id,
      subject_name: subject.subject_name,
      pages_per_paper: Number(subject.pages_per_paper || 0),
      extra_copies: Number(subject.extra_copies || 0)
    }))
  });

  const buildAutosavePayloadKey = (job: JobRow, subjects: EditingSubjectInput[]) => (
    JSON.stringify({
      id: job.id,
      ...buildAutosavePayload(job, subjects)
    })
  );

  const markEditorDirty = () => {
    editVersionRef.current += 1;
    setDirty(true);
  };

  const triggerAutosave = async () => {
    const jobSnapshot = latestEditingJobRef.current;
    const subjectsSnapshot = latestEditingSubjectsRef.current;
    if (!jobSnapshot?.id) return;
    if (jobSnapshot.status === 'Approved' || jobSnapshot.status === 'Invoiced') return;

    const payload = buildAutosavePayload(jobSnapshot, subjectsSnapshot);
    const payloadKey = buildAutosavePayloadKey(jobSnapshot, subjectsSnapshot);
    if (payloadKey === autosaveLastPayloadKeyRef.current) {
      setDirty(false);
      return;
    }

    if (autosaveInFlightRef.current) {
      autosavePendingRef.current = true;
      return;
    }

    autosaveInFlightRef.current = true;
    autosavePendingRef.current = false;
    const requestEditVersion = editVersionRef.current;
    const previousGroupId = String(jobSnapshot.invoice_group_id || '').trim() || undefined;

    setSaving(true);
    try {
      const updated = await api.production.updateExaminationJob(jobSnapshot.id, payload);
      const nextState = {
        ...updated.job,
        subjects: updated.subjects
      } as JobRow;

      autosaveLastPayloadKeyRef.current = payloadKey;

      // Ignore stale responses when a newer local edit exists.
      if (requestEditVersion !== editVersionRef.current) {
        autosavePendingRef.current = true;
        return;
      }

      setJobs(prev => prev.map(job => (job.id === nextState.id ? nextState : job)));
      setGroups(prev => syncGroupsForJobMutation(prev, nextState, previousGroupId));
      setEditingJob(nextState);
      setEditingSubjects(
        (updated.subjects || []).map((subject: ExaminationJobSubject) => ({
          id: subject.id,
          subject_name: subject.subject_name,
          pages_per_paper: subject.pages_per_paper,
          extra_copies: subject.extra_copies
        }))
      );
      setDirty(false);
    } catch (err: any) {
      setError(err.message || 'Auto-save failed.');
    } finally {
      autosaveInFlightRef.current = false;
      setSaving(false);
      if (autosavePendingRef.current) {
        autosavePendingRef.current = false;
        void triggerAutosave();
      }
    }
  };

  const waitForAutosaveIdle = async () => {
    while (autosaveInFlightRef.current) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
  };

  const flushAutosaveIfNeeded = async () => {
    clearAutosaveTimer();
    if (autosaveInFlightRef.current) {
      await waitForAutosaveIdle();
    }
    if (!dirty || !latestEditingJobRef.current?.id || isReadOnly) return;
    await triggerAutosave();
    await waitForAutosaveIdle();
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobData, groupData, profileData, customerData, boms, templates, materialData] = await Promise.all([
        api.production.getExaminationJobs(),
        api.production.getExaminationInvoiceGroups(),
        api.production.getExaminationRecurringProfiles(),
        api.customers.getAll(),
        api.production.getBOMs(),
        api.pricing.getTemplates(),
        api.inventory.getAllItems()
      ]);

      const bomItems: BomOption[] = [
        ...(boms || []).map((bom: any) => ({
          id: bom.id,
          label: `${bom.id} (${bom.itemId || 'BOM'})`,
          source: 'BOM' as const
        })),
        ...(templates || []).map((template: any) => ({
          id: template.id,
          label: `${template.name} (${template.type || 'Template'})`,
          source: 'Template' as const
        }))
      ];

      setJobs((jobData || []) as JobRow[]);
      setGroups((groupData || []) as ExaminationInvoiceGroup[]);
      setProfiles((profileData || []) as ExaminationRecurringProfile[]);
      setCustomers(customerData || []);
      setBomOptions(bomItems);
      setMaterials(materialData || []);

      if (!selectedJobId && jobData?.length) {
        setSelectedJobId(jobData[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load examination module data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await api.production.runExaminationRecurringBilling();
      } catch {
        // Ignore recurring-run startup errors; data view still loads.
      }
      await loadAllData();
    };

    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setEditingJob(null);
      setEditingSubjects([]);
      return;
    }

    const fromList = jobs.find(job => job.id === selectedJobId);
    if (!fromList) return;

    setEditingJob(fromList);
    const nextSubjects = (fromList.subjects || []).map(subject => ({
      id: subject.id,
      subject_name: subject.subject_name,
      pages_per_paper: subject.pages_per_paper,
      extra_copies: subject.extra_copies
    }));
    setEditingSubjects(nextSubjects);
    latestEditingJobRef.current = fromList;
    latestEditingSubjectsRef.current = nextSubjects;
    autosaveLastPayloadKeyRef.current = buildAutosavePayloadKey(fromList, nextSubjects);
    autosavePendingRef.current = false;
    editVersionRef.current = 0;
    setDirty(false);
  }, [selectedJobId, jobs]);

  useEffect(() => {
    setNewJobForm(prev => {
      const nextSchool = prev.school_id || customers[0]?.id || '';
      const nextBom = prev.bom_id || bomOptions[0]?.id || '';
      if (nextSchool === prev.school_id && nextBom === prev.bom_id) {
        return prev;
      }
      return {
        ...prev,
        school_id: nextSchool,
        bom_id: nextBom
      };
    });
  }, [customers, bomOptions]);

  useEffect(() => {
    latestEditingJobRef.current = editingJob;
  }, [editingJob]);

  useEffect(() => {
    latestEditingSubjectsRef.current = editingSubjects;
  }, [editingSubjects]);

  useEffect(() => {
    if (!dirty || !editingJob?.id || isReadOnly) return;

    clearAutosaveTimer();
    autosaveTimer.current = window.setTimeout(() => {
      void triggerAutosave();
    }, 500);

    return () => {
      clearAutosaveTimer();
    };
  }, [dirty, editingJob, editingSubjects, isReadOnly]);

  const setJobField = (field: keyof ExaminationJob, value: any) => {
    if (!editingJob) return;
    setEditingJob({ ...editingJob, [field]: value });
    markEditorDirty();
  };

  const setSubjectField = (index: number, field: 'subject_name' | 'pages_per_paper' | 'extra_copies', value: any) => {
    const next = [...editingSubjects];
    next[index] = {
      ...next[index],
      [field]: field === 'subject_name' ? value : Math.max(0, Number(value || 0))
    };
    setEditingSubjects(next);
    markEditorDirty();
  };

  const handleAddSubject = () => {
    setEditingSubjects(prev => [
      ...prev,
      {
        subject_name: '',
        pages_per_paper: 1,
        extra_copies: 0
      }
    ]);
    markEditorDirty();
  };

  const handleRemoveSubject = (index: number) => {
    const next = editingSubjects.filter((_, i) => i !== index);
    setEditingSubjects(next);
    markEditorDirty();
  };

  const setNewJobField = (
    field: keyof ReturnType<typeof buildDefaultNewJobForm>,
    value: string | number
  ) => {
    setNewJobForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const openNewJobPanel = () => {
    setError(null);
    setNewJobForm(prev => ({
      ...buildDefaultNewJobForm(),
      school_id: prev.school_id || customers[0]?.id || '',
      bom_id: prev.bom_id || bomOptions[0]?.id || ''
    }));
    setShowNewJobPanel(true);
  };

  const closeNewJobPanel = () => {
    setShowNewJobPanel(false);
  };

  const handleCreateJob = async () => {
    if (!newJobForm.school_id || !newJobForm.bom_id) {
      setError('Create at least one customer and one BOM/BOM template before creating an exam job.');
      return;
    }
    if (!newJobForm.exam_name.trim()) {
      setError('Exam name is required.');
      return;
    }
    if (!newJobForm.class_name.trim()) {
      setError('Class is required.');
      return;
    }
    if (Number(newJobForm.number_of_learners) <= 0) {
      setError('Learners must be greater than zero.');
      return;
    }
    if (!newJobForm.subject_name.trim()) {
      setError('At least one subject name is required.');
      return;
    }
    if (Number(newJobForm.pages_per_paper) <= 0) {
      setError('Subject pages must be greater than zero.');
      return;
    }
    if (newJobForm.rounding_rule_type === 'custom' && Number(newJobForm.rounding_value) <= 0) {
      setError('Custom rounding value must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.production.createExaminationJob({
        exam_name: newJobForm.exam_name.trim(),
        school_id: newJobForm.school_id,
        class_name: newJobForm.class_name.trim(),
        number_of_learners: Number(newJobForm.number_of_learners),
        bom_id: newJobForm.bom_id,
        paper_material_id: newJobForm.paper_material_id || undefined,
        toner_material_id: newJobForm.toner_material_id || undefined,
        adjustment_type: newJobForm.adjustment_type,
        adjustment_value: Number(newJobForm.adjustment_value),
        rounding_rule_type: newJobForm.rounding_rule_type,
        rounding_value: Number(newJobForm.rounding_value),
        override_enabled: false,
        manual_price_per_learner: 0,
        subjects: [
          {
            subject_name: newJobForm.subject_name.trim(),
            pages_per_paper: Number(newJobForm.pages_per_paper),
            extra_copies: Number(newJobForm.extra_copies)
          }
        ]
      });

      const next = { ...created.job, subjects: created.subjects } as JobRow;
      setJobs(prev => [next, ...prev]);
      setSelectedJobId(next.id);
      setActiveTab('jobs');
      setShowNewJobPanel(false);
      setNewJobForm({
        ...buildDefaultNewJobForm(),
        school_id: customers[0]?.id || '',
        bom_id: bomOptions[0]?.id || ''
      });
      notify?.('Examination job created', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to create examination job.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!editingJob?.id) return;
    await flushAutosaveIfNeeded();
    setSaving(true);
    try {
      const state = await api.production.recalculateExam(editingJob.id);
      const next = { ...state.job, subjects: state.subjects } as JobRow;
      const previousGroupId = String(editingJob?.invoice_group_id || '').trim() || undefined;
      setJobs(prev => prev.map(job => (job.id === next.id ? next : job)));
      setGroups(prev => syncGroupsForJobMutation(prev, next, previousGroupId));
      setEditingJob(next);
      notify?.('Recalculation completed', 'success');
    } catch (err: any) {
      setError(err.message || 'Recalculation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateOpenJobs = async () => {
    setSaving(true);
    try {
      const summary = await api.production.recalculateOpenExaminationJobs(true);
      await loadAllData();
      notify?.(
        `Recalculated ${summary.recalculated_jobs}/${summary.eligible_jobs} open jobs`,
        summary.failed_jobs > 0 ? 'error' : 'success'
      );
      if (summary.failed_jobs > 0) {
        setError(`Recalculation completed with ${summary.failed_jobs} failures. Check console for details.`);
        console.warn('[ExaminationPrintingV2] Open-job recalculation failures:', summary.errors);
      }
    } catch (err: any) {
      setError(err.message || 'Bulk recalculation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!editingJob?.id) return;
    await flushAutosaveIfNeeded();
    setSaving(true);
    try {
      const state = await api.production.approveExaminationJob(editingJob.id);
      const next = { ...state.job, subjects: state.subjects } as JobRow;
      const previousGroupId = String(editingJob?.invoice_group_id || '').trim() || undefined;
      setJobs(prev => prev.map(job => (job.id === next.id ? next : job)));
      setGroups(prev => syncGroupsForJobMutation(prev, next, previousGroupId));
      setEditingJob(next);
      notify?.('Job approved and inventory deducted', 'success');
    } catch (err: any) {
      setError(err.message || 'Approval failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!editingJob?.id) return;
    await flushAutosaveIfNeeded();
    setSaving(true);
    try {
      await api.production.createExaminationInvoice([editingJob.id]);
      await loadAllData();
      notify?.('Invoice created', 'success');
    } catch (err: any) {
      setError(err.message || 'Invoice creation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddToInvoiceGroup = async () => {
    if (!editingJob?.id) return;
    await flushAutosaveIfNeeded();
    setSaving(true);
    try {
      const existingDraft = groups.find(group =>
        group.school_id === editingJob.school_id && group.status === 'Draft'
      );

      if (existingDraft) {
        await api.production.addJobsToExaminationInvoiceGroup(existingDraft.id, [editingJob.id]);
      } else {
        await api.production.createExaminationInvoiceGroup({
          school_id: editingJob.school_id,
          examination_job_ids: [editingJob.id]
        });
      }

      await loadAllData();
      notify?.('Job added to invoice group', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to add job to invoice group.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGroupFromSelection = async () => {
    if (!groupSchoolId || selectedJobsForGroup.length === 0) {
      setError('Select a school and at least one job to create an invoice group.');
      return;
    }

    setSaving(true);
    try {
      await api.production.createExaminationInvoiceGroup({
        school_id: groupSchoolId,
        examination_job_ids: selectedJobsForGroup
      });
      setSelectedJobsForGroup([]);
      await loadAllData();
      notify?.('Invoice group created', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice group.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateGroupInvoice = async (groupId: string) => {
    setSaving(true);
    try {
      await api.production.generateExaminationGroupInvoice(groupId);
      await loadAllData();
      notify?.('Group invoice generated', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to generate group invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveJobFromGroup = async (groupId: string, jobId: string) => {
    setSaving(true);
    try {
      await api.production.removeJobFromExaminationInvoiceGroup(groupId, jobId);
      await loadAllData();
      notify?.('Job removed from group', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to remove job from group.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    setSaving(true);
    try {
      await api.production.deleteExaminationInvoiceGroup(groupId);
      await loadAllData();
      notify?.('Invoice group deleted', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to delete invoice group.');
    } finally {
      setSaving(false);
    }
  };

  const openRecurringModal = (target: { type: 'job' | 'group'; id: string }) => {
    setRecurringTarget(target);
    setRecurringFrequency('monthly');
    setRecurringStart(new Date().toISOString().split('T')[0]);
    setRecurringEnd('');
    setRecurringAuto(true);
  };

  const handleSaveRecurringProfile = async () => {
    if (!recurringTarget) return;
    setSaving(true);
    try {
      const payload = {
        frequency: recurringFrequency,
        start_date: recurringStart,
        end_date: recurringEnd || undefined,
        auto_generate: recurringAuto
      };

      if (recurringTarget.type === 'job') {
        await api.production.convertExaminationJobToRecurring(recurringTarget.id, payload);
      } else {
        await api.production.convertExaminationGroupToRecurring(recurringTarget.id, payload);
      }

      setRecurringTarget(null);
      await loadAllData();
      notify?.('Recurring profile created', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to create recurring profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunRecurring = async () => {
    setSaving(true);
    try {
      await api.production.runExaminationRecurringBilling();
      await loadAllData();
      notify?.('Recurring cycle executed', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to run recurring cycle.');
    } finally {
      setSaving(false);
    }
  };

  const eligibleJobsForGroup = useMemo(() => {
    return jobs.filter(job =>
      job.school_id === groupSchoolId &&
      job.status !== 'Invoiced'
    );
  }, [jobs, groupSchoolId]);

  const updateGroupSelection = (jobId: string, checked: boolean) => {
    if (checked) {
      setSelectedJobsForGroup(prev => Array.from(new Set([...prev, jobId])));
      return;
    }
    setSelectedJobsForGroup(prev => prev.filter(id => id !== jobId));
  };

  const reportingSummary = useMemo(() => {
    const totalJobs = jobs.length;
    const totalLearners = jobs.reduce((sum, job) => sum + Number(job.number_of_learners || 0), 0);
    const totalPages = jobs.reduce((sum, job) => sum + Number(job.total_pages || 0), 0);
    const totalProductionCost = jobs.reduce((sum, job) => sum + Number(job.production_cost || 0), 0);
    const totalAdjustedCost = jobs.reduce((sum, job) => sum + Number(job.adjusted_cost || 0), 0);
    const totalRevenue = jobs.reduce((sum, job) => sum + Number(job.final_amount || 0), 0);
    const grandTotal = jobs.reduce((sum, job) => sum + Number(job.final_amount || 0), 0);
    const marginAmount = grandTotal - totalAdjustedCost;
    const marginPercent = grandTotal > 0 ? (marginAmount / grandTotal) * 100 : 0;

    const approvedJobs = jobs.filter(job => job.status === 'Approved').length;
    const invoicedJobs = jobs.filter(job => job.status === 'Invoiced').length;
    const overriddenJobs = jobs.filter(job => job.status === 'Overridden').length;
    const draftJobs = jobs.filter(job => job.status === 'Draft').length;
    const calculatedJobs = jobs.filter(job => job.status === 'Calculated').length;

    const activeRecurring = profiles.filter(profile => profile.status === 'Active').length;
    const totalGroupAmount = groups.reduce((sum, group) => sum + Number(group.total_amount || 0), 0);

    return {
      totalJobs,
      totalLearners,
      totalPages,
      totalProductionCost,
      totalAdjustedCost,
      totalRevenue,
      grandTotal,
      marginAmount,
      marginPercent,
      approvedJobs,
      invoicedJobs,
      overriddenJobs,
      draftJobs,
      calculatedJobs,
      activeRecurring,
      totalGroupAmount
    };
  }, [jobs, groups, profiles]);

  const reportingBySchool = useMemo(() => {
    const customerNames = new Map(customers.map(customer => [customer.id, customer.name]));
    const schoolMap = new Map<string, {
      school_id: string;
      school_name: string;
      jobs: number;
      learners: number;
      pages: number;
      production_cost: number;
      revenue: number;
      margin: number;
    }>();

    for (const job of jobs) {
      const schoolId = job.school_id || 'Unknown';
      const schoolName = customerNames.get(schoolId) || schoolId;
      const current = schoolMap.get(schoolId) || {
        school_id: schoolId,
        school_name: schoolName,
        jobs: 0,
        learners: 0,
        pages: 0,
        production_cost: 0,
        revenue: 0,
        margin: 0
      };

      current.jobs += 1;
      current.learners += Number(job.number_of_learners || 0);
      current.pages += Number(job.total_pages || 0);
      current.production_cost += Number(job.adjusted_cost || 0);
      current.revenue += Number(job.final_amount || 0);
      current.margin = current.revenue - current.production_cost;
      schoolMap.set(schoolId, current);
    }

    return Array.from(schoolMap.values()).sort((a, b) => b.revenue - a.revenue);
  }, [jobs, customers]);

  const exportKpiCsv = () => {
    const rows: string[] = [];
    rows.push('Metric,Value');
    rows.push(`GRAND TOTAL,${reportingSummary.grandTotal.toFixed(2)}`);
    rows.push(`Total Jobs,${reportingSummary.totalJobs}`);
    rows.push(`Total Learners,${reportingSummary.totalLearners}`);
    rows.push(`Total Pages,${reportingSummary.totalPages}`);
    rows.push(`Production Cost,${reportingSummary.totalProductionCost.toFixed(2)}`);
    rows.push(`Adjusted Cost,${reportingSummary.totalAdjustedCost.toFixed(2)}`);
    rows.push(`Revenue,${reportingSummary.totalRevenue.toFixed(2)}`);
    rows.push(`Margin Amount,${reportingSummary.marginAmount.toFixed(2)}`);
    rows.push(`Margin Percent,${reportingSummary.marginPercent.toFixed(2)}`);
    rows.push('');
    rows.push('School,Jobs,Learners,Pages,Adjusted Cost,Revenue,Margin');
    for (const row of reportingBySchool) {
      rows.push([
        `"${row.school_name.replace(/"/g, '""')}"`,
        row.jobs,
        row.learners,
        row.pages,
        row.production_cost.toFixed(2),
        row.revenue.toFixed(2),
        row.margin.toFixed(2)
      ].join(','));
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `examination-kpi-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Examination Printing Module</h1>
            <p className="text-sm text-slate-500">Page-driven costing, learner-driven billing, grouped invoicing, and recurring cycles.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadAllData} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold flex items-center gap-2">
              <RefreshCw size={15} /> Refresh
            </button>
            <button
              onClick={handleRecalculateOpenJobs}
              disabled={saving}
              className="px-4 py-2 border border-amber-200 text-amber-700 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
            >
              <Calculator size={15} /> Recalculate Open
            </button>
            <button onClick={openNewJobPanel} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2">
              <Save size={15} /> New Job
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {(['jobs', 'groups', 'recurring', 'reporting'] as TabKey[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {tab === 'jobs'
              ? 'Examination Jobs'
              : tab === 'groups'
                ? 'Invoice Groups'
                : tab === 'recurring'
                  ? 'Recurring'
                  : 'KPI Reporting'}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="mt-0.5" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">Loading examination module...</div>
      )}

      {!loading && activeTab === 'jobs' && (
        <div className="space-y-6">
          {showNewJobPanel && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black text-slate-900">New Examination Job</h2>
                <button onClick={closeNewJobPanel} className="text-sm font-bold text-slate-500">Close</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <label className="text-sm font-medium text-slate-700">Exam Name
                  <input
                    value={newJobForm.exam_name}
                    onChange={e => setNewJobField('exam_name', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="Exam Name"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">School
                  <select
                    value={newJobForm.school_id}
                    onChange={e => setNewJobField('school_id', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Select school</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Class
                  <input
                    value={newJobForm.class_name}
                    onChange={e => setNewJobField('class_name', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="e.g. Grade 12A"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">Learners
                  <input
                    type="number"
                    min={1}
                    value={newJobForm.number_of_learners}
                    onChange={e => setNewJobField('number_of_learners', Math.max(0, Number(e.target.value || 0)))}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    placeholder="e.g. 50"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">BOM
                  <select
                    value={newJobForm.bom_id}
                    onChange={e => setNewJobField('bom_id', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Select BOM</option>
                    {bomOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Paper Material
                  <select
                    value={newJobForm.paper_material_id || ''}
                    onChange={e => setNewJobField('paper_material_id', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Auto-select Paper</option>
                    {materials
                      .filter(m => m.category?.toLowerCase().includes('paper') || m.name.toLowerCase().includes('paper'))
                      .map(material => (
                        <option key={material.id} value={material.id}>
                          {material.name} ({material.unit || 'sheets'})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Toner Material
                  <select
                    value={newJobForm.toner_material_id || ''}
                    onChange={e => setNewJobField('toner_material_id', e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Auto-select Toner</option>
                    {materials
                      .filter(m => m.category?.toLowerCase().includes('toner') || m.name.toLowerCase().includes('toner'))
                      .map(material => (
                        <option key={material.id} value={material.id}>
                          {material.name} ({material.unit || 'grams'})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Adjustment
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <select
                      value={newJobForm.adjustment_type}
                      onChange={e => setNewJobField('adjustment_type', e.target.value)}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="fixed">Fixed</option>
                      <option value="percentage">Percentage</option>
                    </select>
                    <input
                      type="number"
                      value={newJobForm.adjustment_value}
                      onChange={e => setNewJobField('adjustment_value', Number(e.target.value || 0))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </label>
                <label className="text-sm font-medium text-slate-700">Rounding
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <select
                      value={newJobForm.rounding_rule_type}
                      onChange={e => setNewJobField('rounding_rule_type', e.target.value)}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="none">None</option>
                      <option value="nearest_10">Nearest 10</option>
                      <option value="nearest_50">Nearest 50</option>
                      <option value="nearest_100">Nearest 100</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      type="number"
                      disabled={newJobForm.rounding_rule_type !== 'custom'}
                      value={newJobForm.rounding_value}
                      onChange={e => setNewJobField('rounding_value', Number(e.target.value || 0))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-100"
                      placeholder="0.00"
                    />
                  </div>
                </label>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-black text-slate-800">Initial Subject</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm font-medium text-slate-700">Subject
                    <input
                      value={newJobForm.subject_name}
                      onChange={e => setNewJobField('subject_name', e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      placeholder="e.g. Mathematics"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Pages Per Paper
                    <input
                      type="number"
                      min={1}
                      value={newJobForm.pages_per_paper}
                      onChange={e => setNewJobField('pages_per_paper', Math.max(0, Number(e.target.value || 0)))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      placeholder="e.g. 4"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Extra Copies
                    <input
                      type="number"
                      min={0}
                      value={newJobForm.extra_copies}
                      onChange={e => setNewJobField('extra_copies', Math.max(0, Number(e.target.value || 0)))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                      placeholder="e.g. 2"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={closeNewJobPanel} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold">Cancel</button>
                <button onClick={handleCreateJob} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                  <Save size={14} /> Create Job
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2"><Layers size={17} /> Jobs</h2>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {jobs.map(job => (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full text-left p-3 rounded-xl border ${selectedJobId === job.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
                  >
                    <p className="text-sm font-bold text-slate-800">{job.class_name}</p>
                    <p className="text-xs text-slate-500">{job.exam_name}</p>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-slate-600">{job.number_of_learners} learners</span>
                      <span className="font-bold text-slate-700">{job.status}</span>
                    </div>
                  </button>
                ))}
                {jobs.length === 0 && (
                  <div className="text-sm text-slate-500 p-3 border border-dashed border-slate-200 rounded-xl">No jobs yet.</div>
                )}
              </div>
            </div>

            <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
              {!editingJob && <div className="text-sm text-slate-500">Select a job to edit.</div>}
              {editingJob && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-900">Examination Job</h2>
                    <div className="text-xs font-bold text-slate-500">{saving ? 'Saving...' : editingJob.status}</div>
                  </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-sm font-medium text-slate-700">School
                    <select id="job-school" name="job_school" disabled={isReadOnly} value={editingJob.school_id} onChange={e => setJobField('school_id', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Class
                    <input id="job-class" name="job_class" disabled={isReadOnly} value={editingJob.class_name} onChange={e => setJobField('class_name', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Exam Name
                    <input id="job-exam-name" name="job_exam_name" disabled={isReadOnly} value={editingJob.exam_name} onChange={e => setJobField('exam_name', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Learners
                    <input id="job-learners" name="job_learners" disabled={isReadOnly} type="number" min={1} value={editingJob.number_of_learners} onChange={e => setJobField('number_of_learners', Number(e.target.value || 0))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">BOM
                    <select id="job-bom" name="job_bom" disabled={isReadOnly} value={editingJob.bom_id} onChange={e => setJobField('bom_id', e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      {bomOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Paper Material
                    <select 
                      id="job-paper-material"
                      name="job_paper_material"
                      disabled={isReadOnly} 
                      value={editingJob.paper_material_id || ''} 
                      onChange={e => setJobField('paper_material_id', e.target.value)} 
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="">Auto-select Paper</option>
                      {materials
                        .filter(m => m.category?.toLowerCase().includes('paper') || m.name.toLowerCase().includes('paper'))
                        .map(material => (
                          <option key={material.id} value={material.id}>
                            {material.name} ({material.unit || 'sheets'})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Toner Material
                    <select 
                      id="job-toner-material"
                      name="job_toner_material"
                      disabled={isReadOnly} 
                      value={editingJob.toner_material_id || ''} 
                      onChange={e => setJobField('toner_material_id', e.target.value)} 
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="">Auto-select Toner</option>
                      {materials
                        .filter(m => m.category?.toLowerCase().includes('toner') || m.name.toLowerCase().includes('toner'))
                        .map(material => (
                          <option key={material.id} value={material.id}>
                            {material.name} ({material.unit || 'grams'})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Adjustment
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <select id="job-adjustment-type" name="job_adjustment_type" disabled={isReadOnly} value={editingJob.adjustment_type} onChange={e => setJobField('adjustment_type', e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
                        <option value="fixed">Fixed</option>
                        <option value="percentage">Percentage</option>
                      </select>
                      <input id="job-adjustment-value" name="job_adjustment_value" disabled={isReadOnly} type="number" value={editingJob.adjustment_value} onChange={e => setJobField('adjustment_value', Number(e.target.value || 0))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Rounding
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <select id="job-rounding-type" name="job_rounding_type" disabled={isReadOnly} value={editingJob.rounding_rule_type} onChange={e => setJobField('rounding_rule_type', e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
                        <option value="none">None</option>
                        <option value="nearest_10">Nearest 10</option>
                        <option value="nearest_50">Nearest 50</option>
                        <option value="nearest_100">Nearest 100</option>
                        <option value="custom">Custom</option>
                      </select>
                      <input id="job-rounding-value" name="job_rounding_value" disabled={isReadOnly || editingJob.rounding_rule_type !== 'custom'} type="number" value={editingJob.rounding_value || 0} onChange={e => setJobField('rounding_value', Number(e.target.value || 0))} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                    </div>
                  </label>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Settings size={15} /> Subjects</h3>
                    <button disabled={isReadOnly} onClick={handleAddSubject} className="text-sm font-bold text-blue-600">+ Add Subject</button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {subjectRowsPreview.map((subject, index) => (
                      <div key={subject.id || `new-${index}`} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                        <input id={`subject-name-${index}`} name={`subject_name_${index}`} disabled={isReadOnly} value={subject.subject_name} onChange={e => setSubjectField(index, 'subject_name', e.target.value)} className="col-span-4 border border-slate-200 rounded-lg px-2 py-1 text-sm" placeholder="e.g. Mathematics" />
                        <input id={`pages-per-paper-${index}`} name={`pages_per_paper_${index}`} disabled={isReadOnly} type="number" min={1} value={subject.pages_per_paper} onChange={e => setSubjectField(index, 'pages_per_paper', e.target.value)} className="col-span-2 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                        <input id={`extra-copies-${index}`} name={`extra_copies_${index}`} disabled={isReadOnly} type="number" min={0} value={subject.extra_copies} onChange={e => setSubjectField(index, 'extra_copies', e.target.value)} className="col-span-2 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
                        <div className="col-span-3 text-sm font-semibold text-slate-700">{subject.total_pages.toLocaleString()} pages</div>
                        <button disabled={isReadOnly} onClick={() => handleRemoveSubject(index)} className="col-span-1 text-xs text-red-600 font-bold">Del</button>
                      </div>
                    ))}
                    {subjectRowsPreview.length === 0 && (
                      <div className="px-4 py-4 text-sm text-slate-500">No subjects added.</div>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown Section */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <h4 className="text-xs font-bold text-slate-700 mb-2">Cost Breakdown</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <p className="text-slate-500">Total Pages</p>
                      <p className="text-sm font-black">{localTotalPages.toLocaleString()}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <p className="text-slate-500">Production Cost</p>
                      <p className="text-sm font-black">{formatMoney(editingJob.production_cost)}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <p className="text-slate-500">Adjusted Cost</p>
                      <p className="text-sm font-black">{formatMoney(editingJob.adjusted_cost)}</p>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200">
                      <p className="text-slate-500">Cost / Learner</p>
                      <p className="text-sm font-black">{formatMoney(editingJob.cost_per_learner)}</p>
                    </div>
                  </div>
                </div>

                {/* Pricing Section */}
                <div className={`rounded-xl border p-3 ${editingJob.override_enabled ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-700">
                      {editingJob.override_enabled ? 'Pricing (OVERRIDE ENABLED)' : 'Pricing'}
                    </h4>
                    {editingJob.override_enabled && (
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        Using Manual Price
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className={`p-2 rounded-lg border ${editingJob.override_enabled ? 'bg-slate-100 border-slate-200' : 'bg-white border-slate-200'}`}>
                      <p className="text-slate-500">Auto Price</p>
                      <p className={`text-sm font-black ${editingJob.override_enabled ? 'text-slate-400 line-through' : ''}`}>
                        {formatMoney(editingJob.auto_price_per_learner)}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg border ${editingJob.override_enabled ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'}`}>
                      <p className="text-slate-500">{editingJob.override_enabled ? 'Manual Price (Active)' : 'Manual Price'}</p>
                      <p className="text-sm font-black">{formatMoney(editingJob.manual_price_per_learner)}</p>
                    </div>
                    <div className={`p-2 rounded-lg border ${editingJob.override_enabled ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'}`}>
                      <p className="text-slate-500">Final Price</p>
                      <p className="text-sm font-black text-amber-700">{formatMoney(editingJob.final_price_per_learner)}</p>
                    </div>
                    <div className={`p-2 rounded-lg border ${editingJob.override_enabled ? 'bg-amber-100 border-amber-300' : 'bg-white border-slate-200'}`}>
                      <p className="text-slate-500">Total Amount</p>
                      <p className="text-sm font-black text-amber-700">{formatMoney(editingJob.final_amount)}</p>
                    </div>
                  </div>

                  {/* Discrepancy Warning */}
                  {editingJob.override_enabled && editingJob.auto_price_per_learner > 0 && (
                    (() => {
                      const autoTotal = (editingJob.number_of_learners || 0) * (editingJob.auto_price_per_learner || 0);
                      const finalTotal = editingJob.final_amount || 0;
                      const discrepancy = Math.abs(finalTotal - autoTotal);
                      const discrepancyPercent = autoTotal > 0 ? (discrepancy / autoTotal) * 100 : 0;

                      if (discrepancyPercent > 10) { // Show warning if >10% difference
                        return (
                          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-xs text-red-700 font-semibold">
                              ⚠️ Calculation Discrepancy Detected
                            </p>
                            <p className="text-xs text-red-600 mt-1">
                              Auto-calculated total: {formatMoney(autoTotal)} vs Final amount: {formatMoney(finalTotal)}
                              ({Math.round(discrepancyPercent)}% difference)
                            </p>
                            <p className="text-xs text-red-500 mt-1">
                              Please recalculate to ensure consistency.
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}

                  {/* Margin Impact */}
                  <div className="mt-3 text-xs">
                    <span className="text-slate-600 font-semibold">Margin Impact: </span>
                    <span className={`font-bold ${(editingJob.margin_impact || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatMoney(editingJob.margin_impact)}%
                    </span>
                    {(editingJob.margin_impact || 0) < -10 && (
                      <span className="ml-2 text-red-600 font-semibold">⚠️ Significant margin reduction</span>
                    )}
                  </div>
                </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <button onClick={handleRecalculate} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold flex items-center gap-2 justify-center"><Calculator size={14} /> Recalculate</button>
                    <button disabled={isReadOnly} onClick={() => setJobField('override_enabled', !editingJob.override_enabled)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold">Override Price</button>
                    {editingJob.override_enabled && !isReadOnly && (
                      <input id="manual-price-per-learner" name="manual_price_per_learner" type="number" value={editingJob.manual_price_per_learner || 0} onChange={e => setJobField('manual_price_per_learner', Number(e.target.value || 0))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" placeholder="e.g. 5.50" />
                    )}
                    <button onClick={handleApprove} className="px-3 py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-bold flex items-center gap-2 justify-center"><CheckCircle size={14} /> Approve</button>
                    <button onClick={handleAddToInvoiceGroup} className="px-3 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-bold flex items-center gap-2 justify-center"><Layers size={14} /> Add to Group</button>
                    <button onClick={handleCreateInvoice} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold flex items-center gap-2 justify-center"><FileText size={14} /> Create Invoice</button>
                    <button onClick={() => openRecurringModal({ type: 'job', id: editingJob.id })} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-bold flex items-center gap-2 justify-center"><Repeat size={14} /> Convert to Recurring</button>
                  </div>
                  {editingJob.override_enabled && (
                    <label className="text-sm font-medium text-slate-700 block">
                      Override Reason
                      <input
                        id="override-reason"
                        name="override_reason"
                        disabled={isReadOnly}
                        value={editingJob.override_reason || ''}
                        onChange={e => setJobField('override_reason', e.target.value)}
                        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
                        placeholder="e.g. Special price for partner school"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'groups' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-base font-black text-slate-900">Create Invoice Group</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select id="group-school-id" name="group_school_id" value={groupSchoolId} onChange={e => setGroupSchoolId(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
                <option value="">Select school</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
              <button onClick={handleCreateGroupFromSelection} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold">Create Group</button>
              <button onClick={handleRunRecurring} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold">Run Recurring Cycle</button>
            </div>
            {groupSchoolId && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {eligibleJobsForGroup.map(job => (
                  <label key={job.id} className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <input id={`job-selection-${job.id}`} name={`job_selection_${job.id}`} type="checkbox" checked={selectedJobsForGroup.includes(job.id)} onChange={e => updateGroupSelection(job.id, e.target.checked)} />
                    <span className="font-semibold">{job.class_name}</span>
                    <span className="text-xs text-slate-500 ml-auto">{job.number_of_learners} learners</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {groups.map(group => (
              <div key={group.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900">{group.id}</p>
                    <p className="text-xs text-slate-500">School: {customers.find(c => c.id === group.school_id)?.name || group.school_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Total</p>
                    <p className="text-base font-black text-slate-900">{formatMoney(group.total_amount)}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  {(group.jobs || []).map(line => (
                    <div key={line.examination_job_id} className="flex items-center justify-between text-sm">
                      <span>{line.class_name}</span>
                      <div className="flex items-center gap-2">
                        <span>{line.learners} x {formatMoney(line.price_per_learner)} = {formatMoney(line.amount)}</span>
                        {group.status !== 'Invoiced' && (
                          <button
                            onClick={() => handleRemoveJobFromGroup(group.id, line.examination_job_id)}
                            className="px-2 py-1 rounded-lg border border-red-200 text-red-600 text-xs font-bold"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={group.status === 'Invoiced'} onClick={() => handleGenerateGroupInvoice(group.id)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Generate Invoice</button>
                  <button onClick={() => openRecurringModal({ type: 'group', id: group.id })} className="px-3 py-2 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-bold">Convert to Recurring</button>
                  {group.status !== 'Invoiced' && (
                    <button onClick={() => handleDeleteGroup(group.id)} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-bold">Delete Group</button>
                  )}
                  <span className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{group.status}</span>
                </div>
              </div>
            ))}
            {groups.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-500">No invoice groups yet.</div>}
          </div>
        </div>
      )}

      {!loading && activeTab === 'reporting' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900">Examination KPI Reporting</h2>
                <p className="text-sm text-slate-500">Operational and financial snapshot for examination printing jobs.</p>
              </div>
              <button onClick={exportKpiCsv} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold">
                Export KPI CSV
              </button>
            </div>
          </div>

          {/* Grand Total Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl border border-slate-700 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Grand Total (All Jobs)</p>
                <p className="text-4xl font-black text-white mt-1">{formatMoney(reportingSummary.grandTotal)}</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div className="text-right">
                  <p className="text-slate-400">Total Learners</p>
                  <p className="font-bold text-white">{reportingSummary.totalLearners.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">Total Jobs</p>
                  <p className="font-bold text-white">{reportingSummary.totalJobs}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">Avg per Learner</p>
                  <p className="font-bold text-white">
                    {reportingSummary.totalLearners > 0
                      ? formatMoney(reportingSummary.grandTotal / reportingSummary.totalLearners)
                      : formatMoney(0)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Grid (QBO Style) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-slate-500 hover:bg-slate-50 transition-all duration-200">
              <div className="p-2.5 bg-slate-50 text-slate-600 rounded-lg shrink-0"><Layers size={20} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Total Jobs</p>
                <p className="text-lg md:text-xl font-semibold text-slate-900">{reportingSummary.totalJobs}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Draft {reportingSummary.draftJobs} | Calculated {reportingSummary.calculatedJobs}</p>
              </div>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-blue-500 hover:bg-slate-50 transition-all duration-200">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0"><UserRound size={20} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Learners / Pages</p>
                <p className="text-lg md:text-xl font-semibold text-slate-900">{reportingSummary.totalLearners.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{reportingSummary.totalPages.toLocaleString()} pages</p>
              </div>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-amber-500 hover:bg-slate-50 transition-all duration-200">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0"><Calculator size={20} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Production Cost</p>
                <p className="text-lg md:text-xl font-semibold text-amber-600">{formatMoney(reportingSummary.totalProductionCost)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Raw material costs</p>
              </div>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-violet-500 hover:bg-slate-50 transition-all duration-200">
              <div className="p-2.5 bg-violet-50 text-violet-600 rounded-lg shrink-0"><FileText size={20} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Adjusted Cost</p>
                <p className="text-lg md:text-xl font-semibold text-violet-600">{formatMoney(reportingSummary.totalAdjustedCost)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">With adjustments</p>
              </div>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 border-l-4 border-l-emerald-500 hover:bg-slate-50 transition-all duration-200">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0"><CheckCircle size={20} /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-none mb-1.5">Revenue / Margin</p>
                <p className="text-lg md:text-xl font-semibold text-emerald-700">{formatMoney(reportingSummary.totalRevenue)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Margin {formatMoney(reportingSummary.marginAmount)} ({formatPercent(reportingSummary.marginPercent)})</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-900 mb-3">Status KPIs</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Approved Jobs</span><span className="font-bold">{reportingSummary.approvedJobs}</span></div>
                <div className="flex justify-between"><span>Invoiced Jobs</span><span className="font-bold">{reportingSummary.invoicedJobs}</span></div>
                <div className="flex justify-between"><span>Overridden Jobs</span><span className="font-bold">{reportingSummary.overriddenJobs}</span></div>
                <div className="flex justify-between"><span>Active Recurring Profiles</span><span className="font-bold">{reportingSummary.activeRecurring}</span></div>
                <div className="flex justify-between"><span>Total Invoice Group Amount</span><span className="font-bold">{formatMoney(reportingSummary.totalGroupAmount)}</span></div>
              </div>
            </div>

            <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-900 mb-3">School Performance</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2">School</th>
                      <th className="py-2">Jobs</th>
                      <th className="py-2">Learners</th>
                      <th className="py-2">Pages</th>
                      <th className="py-2">Revenue</th>
                      <th className="py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportingBySchool.map(row => (
                      <tr key={row.school_id} className="border-b border-slate-100">
                        <td className="py-2 font-semibold text-slate-800">{row.school_name}</td>
                        <td className="py-2">{row.jobs}</td>
                        <td className="py-2">{row.learners.toLocaleString()}</td>
                        <td className="py-2">{row.pages.toLocaleString()}</td>
                        <td className="py-2">{formatMoney(row.revenue)}</td>
                        <td className={`py-2 font-semibold ${row.margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.margin)}</td>
                      </tr>
                    ))}
                    {reportingBySchool.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500">No reporting data yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'recurring' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">Recurring Profiles</h2>
            <button onClick={handleRunRecurring} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold flex items-center gap-2">
              <RefreshCw size={14} /> Run Cycle
            </button>
          </div>
          <div className="space-y-2">
            {profiles.map(profile => (
              <div key={profile.id} className="border border-slate-200 rounded-xl p-3 text-sm flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800">{profile.id}</p>
                  <p className="text-xs text-slate-500">{profile.source_type} {profile.source_id}</p>
                </div>
                <div className="text-xs text-slate-600">{profile.frequency}</div>
                <div className="text-xs text-slate-600">Next: {new Date(profile.next_run_date).toLocaleDateString()}</div>
                <div className="text-xs font-bold text-slate-700">{profile.status}</div>
              </div>
            ))}
            {profiles.length === 0 && <div className="text-sm text-slate-500">No recurring profiles configured.</div>}
          </div>
        </div>
      )}

      {recurringTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Repeat size={18} /> Convert to Recurring</h3>
            <div className="grid grid-cols-1 gap-3">
              <label className="text-sm">Frequency
                <select id="recurring-frequency" name="recurring_frequency" value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value as 'weekly' | 'monthly' | 'termly')} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="termly">Termly</option>
                </select>
              </label>
              <label className="text-sm">Start Date
                <input id="recurring-start" name="recurring_start" type="date" value={recurringStart} onChange={e => setRecurringStart(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="text-sm">End Date
                <input id="recurring-end" name="recurring_end" type="date" value={recurringEnd} onChange={e => setRecurringEnd(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
              </label>
              <label className="text-sm flex items-center gap-2">
                <input id="recurring-auto" name="recurring_auto" type="checkbox" checked={recurringAuto} onChange={e => setRecurringAuto(e.target.checked)} />
                Auto-generate invoices
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRecurringTarget(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-bold">Cancel</button>
              <button onClick={handleSaveRecurringProfile} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500 flex items-center gap-3">
        <span className="flex items-center gap-1"><School size={12} /> Costing uses BOM pages</span>
        <span className="flex items-center gap-1"><UserRound size={12} /> Billing uses learners</span>
        <span className="flex items-center gap-1"><Calculator size={12} /> Central recalculation engine</span>
      </div>
    </div>
  );
};

export default ExaminationPrintingV2;
