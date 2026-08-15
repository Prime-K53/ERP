import React, { useMemo } from 'react';
import { ExaminationJob } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface PricingSummaryPanelProps {
  job: ExaminationJob | undefined;
  subjects: Array<{
    subject_name: string;
    pages_per_paper: number;
    extra_copies: number;
  }>;
  learners: number;
  isLoading: boolean;
  currencySymbol?: string;
}

const PricingSummaryPanel: React.FC<PricingSummaryPanelProps> = ({
  job,
  subjects,
  learners,
  isLoading,
  currencySymbol = '$'
}) => {
  // Calculate totals from subjects
  const totals = useMemo(() => {
    const totalCopies = subjects.reduce((sum, subject) => sum + learners + (subject.extra_copies || 0), 0);
    const totalPages = subjects.reduce((sum, subject) => sum + (subject.pages_per_paper * (learners + (subject.extra_copies || 0))), 0);
    
    return {
      totalCopies,
      totalPages,
      subjectsCount: subjects.length
    };
  }, [subjects, learners]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: currencySymbol,
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format number with commas
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-MW').format(num);
  };

  // Calculate margin color and icon
  const getMarginInfo = (margin: number) => {
    if (margin > 0) {
      return {
        color: 'text-green-600',
        icon: <TrendingUp className="h-4 w-4" />,
        label: 'Profit'
      };
    } else if (margin < 0) {
      return {
        color: 'text-red-600',
        icon: <TrendingDown className="h-4 w-4" />,
        label: 'Loss'
      };
    } else {
      return {
        color: 'text-gray-600',
        icon: null,
        label: 'Break-even'
      };
    }
  };

  const marginInfo = job ? getMarginInfo(job.margin_impact) : null;

  return (
    <Card className="sticky top-4 border-0 shadow-lg bg-gradient-to-br from-white to-gray-50">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center justify-between">
          <span className="text-white">Pricing Summary</span>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Status:</span>
            <span>
              {job ? (
                <Badge variant={job.status === 'Invoiced' ? 'success' : job.status === 'Approved' ? 'default' : 'secondary'}>
                  {job.status}
                </Badge>
              ) : (
                <Badge variant="secondary">Draft</Badge>
              )}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subjects:</span>
            <span className="font-medium">{totals.subjectsCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Learners:</span>
            <span className="font-medium">{formatNumber(learners)}</span>
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Copies:</span>
            <span className="font-medium">{formatNumber(totals.totalCopies)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total Pages:</span>
            <span className="font-medium">{formatNumber(totals.totalPages)}</span>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Production Cost:</span>
            <span className="font-medium">
              {job ? formatCurrency(job.production_cost) : 'Calculating...'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Adjusted Cost:</span>
            <span className="font-medium">
              {job ? formatCurrency(job.adjusted_cost) : 'Calculating...'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Cost per Learner:</span>
            <span className="font-medium">
              {job ? formatCurrency(job.cost_per_learner) : 'Calculating...'}
            </span>
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Auto Price per Learner:</span>
            <span className="font-medium">
              {job ? formatCurrency(job.auto_price_per_learner) : 'Calculating...'}
            </span>
          </div>
          
          {job?.override_enabled && (
            <div className="flex justify-between text-sm bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <span className="text-gray-600">Manual Price per Learner:</span>
              <span className="font-medium text-yellow-800">
                {formatCurrency(job.manual_price_per_learner || 0)}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm font-semibold text-lg">
            <span>Final Price per Learner:</span>
            <span>
              {job ? formatCurrency(job.final_price_per_learner) : 'Calculating...'}
            </span>
          </div>

          <div className="flex justify-between text-sm font-semibold">
            <span>Total Amount:</span>
            <span>
              {job ? formatCurrency(job.final_amount) : 'Calculating...'}
            </span>
          </div>
        </div>

        {/* Margin Analysis */}
        {job && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Margin Impact:</span>
              <div className="flex items-center space-x-1">
                {marginInfo?.icon}
                <span className={`font-medium ${marginInfo?.color}`}>
                  {job.margin_impact > 0 ? '+' : ''}{job.margin_impact.toFixed(2)}%
                </span>
              </div>
            </div>
            
            {job.override_enabled && job.override_reason && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-blue-900">Manual Override Applied</div>
                    <div className="text-blue-700 mt-1">{job.override_reason}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rounding Info */}
        {job && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Rounding Rule:</span>
              <span className="font-medium">{job.rounding_method || job.rounding_rule_type}</span>
            </div>
            {job.rounding_rule_type === 'custom' && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Custom Value:</span>
                <span className="font-medium">{job.rounding_value}</span>
              </div>
            )}
            {Number(job.rounding_difference || 0) > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Rounding Gain / Learner:</span>
                <span className="font-medium">{formatCurrency(job.rounding_difference || 0)}</span>
              </div>
            )}
          </div>
        )}

        {/* Adjustment Info - Show ALL applied adjustments */}
        {job && (
          <div className="space-y-2">
            {job.adjustment_snapshots && job.adjustment_snapshots.length > 0 ? (
              <>
                <div className="text-xs font-semibold text-gray-700 border-b pb-1 mb-2">
                  Applied Adjustments ({job.adjustment_snapshots.length})
                </div>
                {job.adjustment_snapshots.map((adj, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-gray-500">
                    <span>{adj.name}:</span>
                    <span className="font-medium">
                      {adj.percentage !== undefined ? `${adj.percentage}%` : formatCurrency(adj.value || 0)}
                      <span className="text-gray-400 ml-1">({formatCurrency(adj.calculatedAmount)})</span>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-semibold text-gray-700 border-t pt-1">
                  <span>Total Adjustment:</span>
                  <span>{formatCurrency(job.adjustment_total || 0)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Adjustment Type:</span>
                  <span className="font-medium capitalize">{job.adjustment_type}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Adjustment Value:</span>
                  <span className="font-medium">
                    {job.adjustment_type === 'percentage' ? `${job.adjustment_value}%` : formatCurrency(job.adjustment_value)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Last Updated */}
        {job && (
          <div className="text-xs text-gray-400 text-center border-t pt-2">
            Last updated: {new Date(job.updated_at || job.created_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PricingSummaryPanel;
