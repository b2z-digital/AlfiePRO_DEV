import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  ArrowLeft, Play, Pause, Save, Settings,
  Mail, Clock, GitBranch, UserPlus, UserMinus,
  Zap, Plus, Trash2, Copy, Palette, X, Eye, Edit, GitMerge
} from 'lucide-react';
import EnhancedEmailPageBuilder from '../components/marketing/EnhancedEmailPageBuilder';
import EmailTemplateSelectorModal from '../components/marketing/EmailTemplateSelectorModal';
import {
  getMarketingAutomationFlow,
  updateMarketingAutomationFlow,
  getFlowSteps,
  createFlowStep,
  updateFlowStep,
  deleteFlowStep,
  getFlowConnections,
  createFlowConnection,
  deleteFlowConnection,
  getMarketingSubscriberLists
} from '../utils/marketingStorage';
import { getStoredRaceEvents } from '../utils/raceStorage';
import type { MarketingAutomationFlow, MarketingFlowStep, MarketingSubscriberList, MarketingEmailTemplate } from '../types/marketing';
import type { RaceEvent } from '../types/race';

interface FlowEditorPageProps {
  darkMode?: boolean;
}

export default function MarketingAutomationFlowEditorPage({ darkMode = true }: FlowEditorPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { addNotification } = useNotification();
  const [flow, setFlow] = useState<MarketingAutomationFlow | null>(null);
  const [steps, setSteps] = useState<MarketingFlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<MarketingFlowStep | null>(null);
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [showEmailBuilder, setShowEmailBuilder] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showDeleteStepModal, setShowDeleteStepModal] = useState(false);
  const [showDeleteEmailModal, setShowDeleteEmailModal] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<string | null>(null);
  const [emailBuilderContent, setEmailBuilderContent] = useState<any[]>([]);
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [subscriberLists, setSubscriberLists] = useState<MarketingSubscriberList[]>([]);
  const [showTriggerSettings, setShowTriggerSettings] = useState(false);
  const [connections, setConnections] = useState<any[]>([]);
  const [addingToBranch, setAddingToBranch] = useState<{ stepId: string; branch: 'yes' | 'no' } | null>(null);

  useEffect(() => {
    loadFlow();
  }, [id]);

  async function loadFlow() {
    if (!id || !currentClub) return;

    try {
      setLoading(true);
      const flowData = await getMarketingAutomationFlow(id);
      if (!flowData) {
        navigate('/marketing/flows');
        return;
      }
      setFlow(flowData);

      const [stepsData, eventsData, listsData, connectionsData] = await Promise.all([
        getFlowSteps(id),
        getStoredRaceEvents(),
        getMarketingSubscriberLists(currentClub.clubId),
        getFlowConnections(id)
      ]);

      setSteps(stepsData);
      setEvents(eventsData);
      setSubscriberLists(listsData);
      setConnections(connectionsData);
    } catch (error) {
      console.error('Error loading flow:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddStep(stepType: string) {
    if (!flow) return;

    try {
      const stepConfig = getDefaultStepConfig(stepType);

      const newStep = await createFlowStep({
        flow_id: flow.id,
        step_type: stepType as any,
        name: stepConfig.name,
        config: stepConfig.config,
        position: { x: 100, y: steps.length * 150 + 100 }
      });

      // If adding to a specific branch, create the connection
      if (addingToBranch) {
        await createFlowConnection({
          flow_id: flow.id,
          from_step_id: addingToBranch.stepId,
          to_step_id: newStep.id,
          condition_type: addingToBranch.branch
        });

        // Reload connections
        const updatedConnections = await getFlowConnections(flow.id);
        setConnections(updatedConnections);
        setAddingToBranch(null);
      } else {
        // Connect to the last step if not adding to a branch
        if (steps.length > 0) {
          const lastStep = steps[steps.length - 1];
          await createFlowConnection({
            flow_id: flow.id,
            from_step_id: lastStep.id,
            to_step_id: newStep.id,
            condition_type: null
          });
          const updatedConnections = await getFlowConnections(flow.id);
          setConnections(updatedConnections);
        }
      }

      setSteps([...steps, newStep]);
      setShowAddStepModal(false);
      addNotification('Step added successfully', 'success');
    } catch (error) {
      console.error('Error adding step:', error);
      addNotification('Failed to add step', 'error');
    }
  }

  // Helper function to get child steps for a given parent step
  function getChildSteps(parentId: string | null, conditionType: 'yes' | 'no' | null = null) {
    const childConnections = connections.filter(conn =>
      conn.from_step_id === parentId &&
      (conditionType === null || conn.condition_type === conditionType)
    );
    return childConnections.map(conn => steps.find(s => s.id === conn.to_step_id)).filter(Boolean);
  }

  // Helper function to get the last step in a branch (recursively finds the deepest child)
  function getLastStepInBranch(stepId: string): string {
    const children = getChildSteps(stepId, null);
    if (children.length === 0) {
      return stepId;
    }
    // Return the last child's last step (recursively)
    return getLastStepInBranch(children[children.length - 1].id);
  }

  // Get root steps (steps with no parent connection)
  function getRootSteps() {
    const childStepIds = connections.map(conn => conn.to_step_id);
    return steps.filter(step => !childStepIds.includes(step.id));
  }

  // Render step tree recursively
  const renderStepTree = (step: any): JSX.Element => {
    const StepIcon = getStepIcon(step.step_type);
    const stepColor = getStepColor(step.step_type);
    const yesChildren = getChildSteps(step.id, 'yes');
    const noChildren = getChildSteps(step.id, 'no');
    const regularChildren = getChildSteps(step.id, null);

    return (
      <div key={step.id}>
        {/* Step Card */}
        <div
          className={`rounded-xl p-6 cursor-pointer transition-all ${
            selectedStep?.id === step.id
              ? darkMode
                ? 'bg-slate-700/70 border-2 border-blue-500'
                : 'bg-blue-50 border-2 border-blue-500'
              : darkMode
                ? 'bg-slate-800/50 border border-slate-700 hover:bg-slate-800/70'
                : 'bg-white border border-gray-200 hover:shadow-md'
          }`}
          onClick={() => setSelectedStep(step)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-${stepColor}-500 to-${stepColor}-600 flex items-center justify-center`}>
                <StepIcon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  {step.name}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  {step.step_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteStep(step.id);
                }}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          </div>

          {/* Step Details */}
          {step.step_type === 'send_email' && step.subject && (
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <strong>Subject:</strong> {step.subject}
              </p>
            </div>
          )}
          {step.step_type === 'wait' && step.config && (
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <strong>Wait:</strong>{' '}
                {step.config.wait_type === 'event_relative' ? (
                  <>
                    {step.config.delay_value} {step.config.delay_unit} {step.config.event_timing} event start
                    {step.config.event_id && (
                      <span className={`block text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                        Event: {events.find((e: any) => e.id === step.config.event_id)?.eventName || 'Unknown'}
                      </span>
                    )}
                  </>
                ) : (
                  `${step.config.delay_value} ${step.config.delay_unit}`
                )}
              </p>
            </div>
          )}
          {step.step_type === 'conditional_split' && step.config && (
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              {!step.config.condition_type ? (
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <p className={`text-sm ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                    Set up conditional split
                  </p>
                </div>
              ) : (
                <>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    <strong>Condition:</strong> {step.config.condition_type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </p>
                  {step.config.condition_type === 'event_registration' && step.config.event_id && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Event: {events.find((e: any) => e.id === step.config.event_id)?.eventName || 'Unknown'}
                    </p>
                  )}
                  {step.config.condition_type === 'in_list' && step.config.list_id && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      List: {subscriberLists.find((l: any) => l.id === step.config.list_id)?.name || 'Unknown'}
                      {step.config.list_condition && ` (${step.config.list_condition === 'in' ? 'Is in' : 'Is not in'})`}
                    </p>
                  )}
                  {step.config.condition_type === 'membership_status' && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Status: {step.config.membership_status}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {step.step_type === 'condition' && step.config && (
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <strong>Condition:</strong> {step.config.condition_type?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Not configured'}
              </p>
              {step.config.condition_type === 'event_registration' && step.config.event_id && (
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Event: {events.find((e: any) => e.id === step.config.event_id)?.eventName || 'Unknown'}
                </p>
              )}
              {step.config.condition_type === 'in_list' && step.config.list_id && (
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  List: {subscriberLists.find((l: any) => l.id === step.config.list_id)?.name || 'Unknown'}
                </p>
              )}
            </div>
          )}
          {(step.step_type === 'add_to_list' || step.step_type === 'remove_from_list') && step.config?.list_id && (
            <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <strong>List:</strong> {subscriberLists.find((l: any) => l.id === step.config.list_id)?.name || 'Unknown'}
              </p>
            </div>
          )}
        </div>

        {/* Connectors and Children */}
        {step.step_type === 'conditional_split' ? (
          <div className="relative pt-8 pb-4">
            {/* SVG connector lines with proper T-junction */}
            <svg className="absolute inset-0 w-full pointer-events-none" style={{ top: 0, left: 0, height: '100px' }}>
              {/* Center vertical line down to T-junction */}
              <line
                x1="50%"
                y1="0"
                x2="50%"
                y2="32"
                stroke={darkMode ? '#475569' : '#d1d5db'}
                strokeWidth="2"
              />

              {/* Junction dot at top of T */}
              <circle
                cx="50%"
                cy="32"
                r="4"
                fill={darkMode ? '#475569' : '#d1d5db'}
              />

              {/* Horizontal line connecting the branches */}
              <line
                x1="25%"
                y1="32"
                x2="75%"
                y2="32"
                stroke={darkMode ? '#475569' : '#d1d5db'}
                strokeWidth="2"
              />

              {/* Junction dot at left branch */}
              <circle
                cx="25%"
                cy="32"
                r="4"
                fill={darkMode ? '#475569' : '#d1d5db'}
              />

              {/* Junction dot at right branch */}
              <circle
                cx="75%"
                cy="32"
                r="4"
                fill={darkMode ? '#475569' : '#d1d5db'}
              />

              {/* Left vertical line down from junction (Yes branch) */}
              <line
                x1="25%"
                y1="32"
                x2="25%"
                y2="100"
                stroke={darkMode ? '#475569' : '#d1d5db'}
                strokeWidth="2"
              />

              {/* Right vertical line down from junction (No branch) */}
              <line
                x1="75%"
                y1="32"
                x2="75%"
                y2="100"
                stroke={darkMode ? '#475569' : '#d1d5db'}
                strokeWidth="2"
              />
            </svg>

            {/* Branching */}
            <div className="flex items-start justify-center gap-32 relative" style={{ paddingTop: '68px' }}>
              {/* Yes Path */}
              <div className="flex flex-col items-center">
                {/* Yes label positioned on the connector */}
                <div className="absolute" style={{ top: '12px', left: 'calc(25% - 16px)' }}>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    darkMode ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200'
                  }`}>
                    Yes
                  </span>
                </div>

                <div className="w-full flex flex-col items-center">
                  {yesChildren.map((child: any, idx: number) => (
                    <div key={child.id} className="w-full">
                      {/* SVG connector between branch children (only after first child) */}
                      {idx > 0 && (
                        <div className="relative flex justify-center" style={{ height: '32px' }}>
                          <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            <line
                              x1="50%"
                              y1="0"
                              x2="50%"
                              y2="100%"
                              stroke={darkMode ? '#475569' : '#d1d5db'}
                              strokeWidth="2"
                            />
                            <circle
                              cx="50%"
                              cy="0"
                              r="4"
                              fill={darkMode ? '#475569' : '#d1d5db'}
                            />
                          </svg>
                        </div>
                      )}
                      {renderStepTree(child)}
                    </div>
                  ))}

                  {/* Always show add button after children */}
                  <div className="relative flex justify-center" style={{ height: '32px' }}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <line
                        x1="50%"
                        y1="0"
                        x2="50%"
                        y2="100%"
                        stroke={darkMode ? '#475569' : '#d1d5db'}
                        strokeWidth="2"
                      />
                      <circle
                        cx="50%"
                        cy="0"
                        r="4"
                        fill={darkMode ? '#475569' : '#d1d5db'}
                      />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // If there are children, connect to the last child, otherwise to the conditional split
                      const lastChild = yesChildren[yesChildren.length - 1];
                      const parentId = lastChild ? getLastStepInBranch(lastChild.id) : step.id;
                      setAddingToBranch({ stepId: parentId, branch: yesChildren.length > 0 ? null : 'yes' });
                      setShowAddStepModal(true);
                    }}
                    className={`w-10 h-10 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${
                      darkMode ? 'border-slate-500 hover:border-blue-400 hover:bg-slate-800 text-slate-400' : 'border-gray-400 hover:border-blue-500 hover:bg-gray-50 text-gray-400'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* No Path */}
              <div className="flex flex-col items-center">
                {/* No label positioned on the connector */}
                <div className="absolute" style={{ top: '12px', left: 'calc(75% - 14px)' }}>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    darkMode ? 'bg-slate-700 text-slate-300 border border-slate-600' : 'bg-gray-200 text-gray-700 border border-gray-300'
                  }`}>
                    No
                  </span>
                </div>

                <div className="w-full flex flex-col items-center">
                  {noChildren.map((child: any, idx: number) => (
                    <div key={child.id} className="w-full">
                      {/* SVG connector between branch children (only after first child) */}
                      {idx > 0 && (
                        <div className="relative flex justify-center" style={{ height: '32px' }}>
                          <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            <line
                              x1="50%"
                              y1="0"
                              x2="50%"
                              y2="100%"
                              stroke={darkMode ? '#475569' : '#d1d5db'}
                              strokeWidth="2"
                            />
                            <circle
                              cx="50%"
                              cy="0"
                              r="4"
                              fill={darkMode ? '#475569' : '#d1d5db'}
                            />
                          </svg>
                        </div>
                      )}
                      {renderStepTree(child)}
                    </div>
                  ))}

                  {/* Always show add button after children */}
                  <div className="relative flex justify-center" style={{ height: '32px' }}>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      <line
                        x1="50%"
                        y1="0"
                        x2="50%"
                        y2="100%"
                        stroke={darkMode ? '#475569' : '#d1d5db'}
                        strokeWidth="2"
                      />
                      <circle
                        cx="50%"
                        cy="0"
                        r="4"
                        fill={darkMode ? '#475569' : '#d1d5db'}
                      />
                    </svg>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // If there are children, connect to the last child, otherwise to the conditional split
                      const lastChild = noChildren[noChildren.length - 1];
                      const parentId = lastChild ? getLastStepInBranch(lastChild.id) : step.id;
                      setAddingToBranch({ stepId: parentId, branch: noChildren.length > 0 ? null : 'no' });
                      setShowAddStepModal(true);
                    }}
                    className={`w-10 h-10 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${
                      darkMode ? 'border-slate-500 hover:border-slate-400 hover:bg-slate-800 text-slate-400' : 'border-gray-400 hover:border-gray-500 hover:bg-gray-50 text-gray-400'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : regularChildren.length > 0 ? (
          <>
            {regularChildren.map((child: any, idx: number) => (
              <div key={child.id}>
                {/* SVG connector between regular steps */}
                <div className="relative flex justify-center" style={{ height: '32px' }}>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <line
                      x1="50%"
                      y1="0"
                      x2="50%"
                      y2="100%"
                      stroke={darkMode ? '#475569' : '#d1d5db'}
                      strokeWidth="2"
                    />
                    <circle
                      cx="50%"
                      cy="0"
                      r="4"
                      fill={darkMode ? '#475569' : '#d1d5db'}
                    />
                  </svg>
                </div>
                {renderStepTree(child)}
              </div>
            ))}
          </>
        ) : null}
      </div>
    );
  };

  function handleDeleteStep(stepId: string) {
    setStepToDelete(stepId);
    setShowDeleteStepModal(true);
  }

  async function confirmDeleteStep() {
    if (!stepToDelete) return;

    try {
      await deleteFlowStep(stepToDelete);
      setSteps(steps.filter(s => s.id !== stepToDelete));
      if (selectedStep?.id === stepToDelete) {
        setSelectedStep(null);
      }
      setShowDeleteStepModal(false);
      setStepToDelete(null);
      addNotification('Step deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting step:', error);
      addNotification('Failed to delete step', 'error');
    }
  }

  async function handleUpdateStep(stepId: string, updates: Partial<MarketingFlowStep>) {
    try {
      const updatedStep = await updateFlowStep(stepId, updates);
      setSteps(steps.map(s => s.id === stepId ? updatedStep : s));
      if (selectedStep?.id === stepId) {
        setSelectedStep(updatedStep);
      }
    } catch (error) {
      console.error('Error updating step:', error);
      addNotification('Failed to update step', 'error');
    }
  }

  async function handleUpdateFlow(updates: Partial<MarketingAutomationFlow>) {
    if (!flow) return;

    try {
      const updatedFlow = await updateMarketingAutomationFlow(flow.id, updates);
      setFlow(updatedFlow);
    } catch (error) {
      console.error('Error updating flow:', error);
      addNotification('Failed to update flow', 'error');
    }
  }

  function openEmailBuilder() {
    if (!selectedStep) return;

    // Load existing content if available
    const existingContent = selectedStep.email_content_json as any;
    setEmailBuilderContent(existingContent?.rows || []);
    setShowEmailBuilder(true);
  }

  function openTemplateSelector() {
    setShowTemplateSelector(true);
  }

  function handleTemplateSelect(template: MarketingEmailTemplate) {
    if (!selectedStep) return;

    // Load template content into the step
    handleUpdateStep(selectedStep.id, {
      email_content_json: template.email_content_json,
      email_content_html: template.email_content_html,
      subject: template.subject || selectedStep.subject
    });

    setShowTemplateSelector(false);
    addNotification('Template applied successfully', 'success');
  }

  function handleDeleteEmailContent() {
    setShowDeleteEmailModal(true);
  }

  async function confirmDeleteEmailContent() {
    if (!selectedStep) return;

    handleUpdateStep(selectedStep.id, {
      email_content_json: null,
      email_content_html: null
    });

    setShowDeleteEmailModal(false);
    addNotification('Email content deleted', 'success');
  }

  function handlePreviewEmail() {
    if (!selectedStep) return;

    // If HTML doesn't exist, generate it from JSON on the fly
    if (!selectedStep.email_content_html && selectedStep.email_content_json) {
      const content = (selectedStep.email_content_json as any)?.rows || [];
      const html = generateEmailHTML(content);
      // Update the step with generated HTML
      handleUpdateStep(selectedStep.id, {
        email_content_html: html
      });
    }

    setShowEmailPreview(true);
  }

  function saveEmailContent(content: any[]) {
    if (!selectedStep) return;

    // Convert the email builder content to HTML
    const html = generateEmailHTML(content);

    // Update the step with both JSON structure and HTML
    handleUpdateStep(selectedStep.id, {
      email_content_json: { rows: content } as any,
      email_content_html: html
    });

    setShowEmailBuilder(false);
  }

  function generateEmailHTML(rows: any[]): string {
    // Generate HTML that matches the email designer exactly
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    * { box-sizing: border-box; }
    img { border: 0; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff;">
          <tr>
            <td style="padding: 0;">`;

    if (!rows || rows.length === 0) {
      html += '<p style="text-align: center; color: #666; margin: 0;">No content</p>';
    } else {
      rows.forEach(row => {
        // Get padding values - use 0 if not specified
        const paddingTop = row.paddingTop !== undefined ? row.paddingTop : 0;
        const paddingRight = row.paddingRight !== undefined ? row.paddingRight : 0;
        const paddingBottom = row.paddingBottom !== undefined ? row.paddingBottom : 0;
        const paddingLeft = row.paddingLeft !== undefined ? row.paddingLeft : 0;

        const rowBgColor = row.backgroundColor || 'transparent';

        // Create row with proper padding
        html += `<div style="background-color: ${rowBgColor}; padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px; margin: 0;">`;

        if (row.blocks && Array.isArray(row.blocks)) {
          row.blocks.forEach((block: any) => {
            if (!block || !block.type) return;

            switch (block.type) {
              case 'heading':
                const headingLevel = block.config?.level || 2;
                const headingStyle = `color: ${block.config?.color || '#000000'}; text-align: ${block.config?.align || 'left'}; font-size: ${block.config?.fontSize || 24}px; font-weight: ${block.config?.fontWeight || 'bold'}; margin: ${block.config?.marginTop || 0}px 0 ${block.config?.marginBottom || 0}px 0; padding: 0;`;
                html += `<h${headingLevel} style="${headingStyle}">${block.config?.text || ''}</h${headingLevel}>`;
                break;

              case 'text':
                const textStyle = `color: ${block.config?.color || '#000000'}; text-align: ${block.config?.align || 'left'}; font-size: ${block.config?.fontSize || 14}px; line-height: 1.6; margin: ${block.config?.marginTop || 0}px 0 ${block.config?.marginBottom || 0}px 0; padding: 0;`;
                html += `<div style="${textStyle}">${block.config?.text || ''}</div>`;
                break;

              case 'button':
                const buttonAlign = block.config?.align || 'center';
                const buttonStyle = `display: inline-block; background-color: ${block.config?.backgroundColor || '#3b82f6'}; color: ${block.config?.textColor || '#ffffff'}; padding: ${block.config?.paddingTop || 12}px ${block.config?.paddingLeft || 24}px; text-decoration: none; border-radius: ${block.config?.borderRadius || 6}px; font-size: ${block.config?.fontSize || 16}px;`;
                const buttonMargin = `text-align: ${buttonAlign}; margin: ${block.config?.marginTop || 10}px 0 ${block.config?.marginBottom || 10}px 0;`;
                html += `<div style="${buttonMargin}"><a href="${block.config?.url || '#'}" style="${buttonStyle}">${block.config?.text || 'Button'}</a></div>`;
                break;

              case 'image':
                const imageUrl = block.config?.url || block.config?.src || '';
                if (imageUrl) {
                  // Get width - check if it's full width (100 or '100%')
                  const imageWidth = block.config?.width;
                  const isFullWidth = imageWidth === 100 || imageWidth === '100%' || imageWidth === '100' || !imageWidth;

                  const marginTop = block.config?.marginTop || 0;
                  const marginBottom = block.config?.marginBottom || 0;
                  const borderRadius = block.config?.borderRadius || 0;
                  const imageAlign = block.config?.align || 'center';

                  if (isFullWidth) {
                    // Full width image - display: block, width: 100%
                    html += `<img src="${imageUrl}" alt="${block.config?.alt || ''}" style="width: 100%; height: auto; display: block; margin: ${marginTop}px 0 ${marginBottom}px 0; border: 0; border-radius: ${borderRadius}px;" />`;
                  } else {
                    // Constrained width image
                    const imgWidth = typeof imageWidth === 'number' ? `${imageWidth}%` : imageWidth;
                    html += `<div style="text-align: ${imageAlign}; margin: ${marginTop}px 0 ${marginBottom}px 0;"><img src="${imageUrl}" alt="${block.config?.alt || ''}" style="width: ${imgWidth}; max-width: ${imgWidth}; height: auto; display: inline-block; border: 0; border-radius: ${borderRadius}px;" /></div>`;
                  }
                }
                break;

              case 'divider':
                const dividerStyle = `border: none; border-top: ${block.config?.thickness || 1}px ${block.config?.style || 'solid'} ${block.config?.color || '#e5e7eb'}; margin: ${block.config?.marginTop || 20}px 0 ${block.config?.marginBottom || 20}px 0;`;
                html += `<hr style="${dividerStyle}" />`;
                break;

              case 'spacer':
                html += `<div style="height: ${block.config?.height || 20}px; line-height: ${block.config?.height || 20}px; font-size: 0;"></div>`;
                break;

              default:
                console.warn('Unknown block type:', block.type);
            }
          });
        }

        html += '</div>';
      });
    }

    html += `            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return html;
  }

  async function handleSaveFlow() {
    if (!flow) return;

    try {
      await updateMarketingAutomationFlow(flow.id, { updated_at: new Date().toISOString() });
      addNotification('Flow saved successfully', 'success');
    } catch (error) {
      console.error('Error saving flow:', error);
      addNotification('Failed to save flow', 'error');
    }
  }

  async function handlePublish() {
    if (!flow) return;

    try {
      const updates: Partial<MarketingAutomationFlow> = {
        status: 'active',
        activated_at: new Date().toISOString()
      };
      const updatedFlow = await updateMarketingAutomationFlow(flow.id, updates);
      setFlow(updatedFlow);
      addNotification('Flow published and activated successfully', 'success');
    } catch (error) {
      console.error('Error publishing flow:', error);
      addNotification('Failed to publish flow', 'error');
    }
  }

  async function handleUnpublish() {
    if (!flow) return;

    try {
      const updatedFlow = await updateMarketingAutomationFlow(flow.id, { status: 'paused' });
      setFlow(updatedFlow);
      addNotification('Flow unpublished successfully', 'success');
    } catch (error) {
      console.error('Error unpublishing flow:', error);
      addNotification('Failed to unpublish flow', 'error');
    }
  }

  function getDefaultStepConfig(stepType: string) {
    const configs: Record<string, { name: string; config: any }> = {
      send_email: {
        name: 'Send Email',
        config: {
          subject: 'Email Subject',
          from_name: currentClub?.club?.name || 'Club',
          from_email: 'noreply@alfiepro.com.au'
        }
      },
      wait: {
        name: 'Wait',
        config: {
          wait_type: 'fixed',
          delay_value: 1,
          delay_unit: 'days',
          event_timing: 'before',
          event_id: null
        }
      },
      conditional_split: {
        name: 'Conditional Split',
        config: {
          condition_type: '',
          list_id: null,
          event_id: null,
          list_condition: 'in',
          registration_condition: 'registered'
        }
      },
      condition: {
        name: 'Condition',
        config: {
          condition_type: 'opened_email',
          comparison: 'equals',
          value: true
        }
      },
      add_to_list: {
        name: 'Add to List',
        config: {
          list_id: null
        }
      },
      remove_from_list: {
        name: 'Remove from List',
        config: {
          list_id: null
        }
      }
    };

    return configs[stepType] || { name: 'New Step', config: {} };
  }

  const getStepIcon = (stepType: string) => {
    const icons: Record<string, any> = {
      send_email: Mail,
      wait: Clock,
      conditional_split: GitMerge,
      condition: GitBranch,
      add_to_list: UserPlus,
      remove_from_list: UserMinus,
      webhook: Zap
    };
    return icons[stepType] || Mail;
  };

  const getStepColor = (stepType: string) => {
    const colors: Record<string, string> = {
      send_email: 'blue',
      wait: 'yellow',
      conditional_split: 'purple',
      condition: 'purple',
      add_to_list: 'green',
      remove_from_list: 'red',
      webhook: 'orange'
    };
    return colors[stepType] || 'gray';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            Flow not found
          </h2>
          <button
            onClick={() => navigate('/marketing/flows')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Flows
          </button>
        </div>
      </div>
    );
  }

  const stepTypes = [
    { type: 'send_email', icon: Mail, label: 'Send Email', color: 'blue' },
    { type: 'wait', icon: Clock, label: 'Wait', color: 'yellow' },
    { type: 'conditional_split', icon: GitMerge, label: 'Conditional Split', color: 'purple' },
    { type: 'condition', icon: GitBranch, label: 'Condition', color: 'purple' },
    { type: 'add_to_list', icon: UserPlus, label: 'Add to List', color: 'green' },
    { type: 'remove_from_list', icon: UserMinus, label: 'Remove from List', color: 'red' }
  ];

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: darkMode ? '#0f172a' : '#f8fafc' }}>
      {/* Header */}
      <div className={`border-b px-6 py-4 ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              {flow.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                {flow.description || 'Automation Flow'}
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                flow.status === 'active'
                  ? 'bg-green-500/20 text-green-400'
                  : flow.status === 'draft'
                  ? 'bg-gray-500/20 text-gray-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {flow.status === 'active' ? 'Active' : flow.status === 'draft' ? 'Draft' : 'Paused'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveFlow}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <Save className="w-4 h-4" />
              Save
            </button>

            {flow.status === 'draft' ? (
              <button
                onClick={handlePublish}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
              >
                Publish
              </button>
            ) : (
              <button
                onClick={flow.status === 'active' ? handleUnpublish : handlePublish}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  flow.status === 'active'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {flow.status === 'active' ? 'Unpublish' : 'Publish'}
              </button>
            )}

            <button
              onClick={() => navigate('/marketing/flows')}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
              title="Exit"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Flow Canvas */}
        <div className="flex-1 overflow-auto p-8">
          {steps.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Zap className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
                <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  No steps yet
                </h3>
                <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  Add your first step to start building your automation flow
                </p>
                <button
                  onClick={() => setShowAddStepModal(true)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  Add Step
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-2xl mx-auto">
              {/* Trigger */}
              <div className={`rounded-xl p-6 ${
                darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-white border border-gray-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Trigger: {flow.trigger_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      Flow starts when this event occurs
                    </p>
                    {flow.trigger_config?.event_id && flow.trigger_type === 'event_registration' && (
                      <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                        <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          <strong>Event:</strong> {events.find(e => e.id === flow.trigger_config?.event_id)?.eventName || 'Unknown Event'}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setShowTriggerSettings(true)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className={`w-0.5 h-8 ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
              </div>

              {/* Steps - Recursive Tree Rendering */}
              {getRootSteps().map((step, index) => (
                <div key={step.id}>
                  {index > 0 && (
                    <div className="flex justify-center">
                      <div className={`w-0.5 h-8 ${darkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
                    </div>
                  )}
                  {renderStepTree(step)}
                </div>
              ))}

              {/* Add Step Button (only show if no steps or no conditional split at end) */}
              {(steps.length === 0 || (steps.length > 0 && steps[steps.length - 1].step_type !== 'conditional_split')) && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => setShowAddStepModal(true)}
                    className={`px-6 py-3 rounded-lg flex items-center gap-2 transition-colors ${
                      darkMode
                        ? 'bg-slate-800/50 border border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Plus className="w-5 h-5" />
                    Add Step
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar - Step Settings */}
        {selectedStep && (
          <div className={`w-96 border-l overflow-auto ${
            darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'
          }`}>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`text-lg font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Step Settings
                </h2>
                <button
                  onClick={() => setSelectedStep(null)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Step Name
                </label>
                <input
                  type="text"
                  value={selectedStep.name}
                  onChange={(e) => handleUpdateStep(selectedStep.id, { name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {selectedStep.step_type === 'send_email' && (
                <>
                  {/* Performance Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Performance
                      </h3>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                        Based on the last 30 days
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Open rate
                        </span>
                        <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          –
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Click rate
                        </span>
                        <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          –
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`} />

                  {/* Subject and Sender Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Subject and sender
                      </h3>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Subject line
                        </label>
                        <input
                          type="text"
                          value={selectedStep.subject || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, { subject: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          placeholder="e.g., Welcome to our event!"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Preview text
                        </label>
                        <input
                          type="text"
                          value={selectedStep.preview_text || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, { preview_text: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          placeholder="Preview text shown in inbox"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Sender name
                        </label>
                        <input
                          type="text"
                          value={selectedStep.from_name || currentClub?.club?.name || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, { from_name: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          placeholder="Your club name"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          Sender email address
                        </label>
                        <input
                          type="email"
                          value={selectedStep.from_email || 'noreply@alfiepro.com.au'}
                          onChange={(e) => handleUpdateStep(selectedStep.id, { from_email: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          placeholder="noreply@alfiepro.com.au"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`} />

                  {/* Template Section */}
                  <div>
                    <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Template
                    </h3>

                    {selectedStep.email_content_json ? (
                      // Show email content card when content exists
                      <div className={`rounded-lg border p-4 ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-700'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0`}>
                              <Mail className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className={`font-semibold text-sm ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                                Email Design Ready
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                {(selectedStep.email_content_json as any)?.rows?.length || 0} section(s)
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handlePreviewEmail}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                              darkMode
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                            }`}
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </button>
                          <button
                            onClick={openEmailBuilder}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                              darkMode
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            <Edit className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={handleDeleteEmailContent}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${
                              darkMode
                                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Show selection buttons when no content exists
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={openEmailBuilder}
                          className={`px-4 py-6 rounded-lg border-2 border-dashed transition-all ${
                            darkMode
                              ? 'border-slate-600 hover:border-slate-500 bg-slate-900/30 hover:bg-slate-900/50'
                              : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center`}>
                              <Palette className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                                Design Email
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                Visual builder
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={openTemplateSelector}
                          className={`px-4 py-6 rounded-lg border-2 border-dashed transition-all ${
                            darkMode
                              ? 'border-slate-600 hover:border-slate-500 bg-slate-900/30 hover:bg-slate-900/50'
                              : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center`}>
                              <Mail className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                                Select Template
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                                Pre-designed
                              </p>
                            </div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedStep.step_type === 'wait' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Wait Type
                    </label>
                    <select
                      value={selectedStep.config?.wait_type || 'fixed'}
                      onChange={(e) => handleUpdateStep(selectedStep.id, {
                        config: { ...selectedStep.config, wait_type: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="fixed">Fixed Duration</option>
                      <option value="event_relative">Relative to Event Start Date</option>
                    </select>
                  </div>

                  {selectedStep.config?.wait_type === 'event_relative' && (
                    <>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          Event
                        </label>
                        <select
                          value={selectedStep.config?.event_id || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, event_id: e.target.value || null }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="">Select Event</option>
                          {events.map(event => (
                            <option key={event.id} value={event.id}>
                              {event.eventName || 'Unnamed Event'} - {new Date(event.date).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          Timing
                        </label>
                        <select
                          value={selectedStep.config?.event_timing || 'before'}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, event_timing: e.target.value }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="before">Before Event Start</option>
                          <option value="after">After Event Start</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        {selectedStep.config?.wait_type === 'event_relative' ? 'Duration' : 'Wait Time'}
                      </label>
                      <input
                        type="number"
                        value={selectedStep.config?.delay_value || 1}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, delay_value: parseInt(e.target.value) }
                        })}
                        min="1"
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Unit
                      </label>
                      <select
                        value={selectedStep.config?.delay_unit || 'days'}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, delay_unit: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                      </select>
                    </div>
                  </div>

                  {selectedStep.config?.wait_type === 'event_relative' && selectedStep.config?.event_id && (
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                      <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        Will trigger {selectedStep.config?.delay_value} {selectedStep.config?.delay_unit} {selectedStep.config?.event_timing} the start of{' '}
                        <strong>{events.find(e => e.id === selectedStep.config?.event_id)?.eventName || 'Selected Event'}</strong>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {selectedStep.step_type === 'conditional_split' && (
                <>
                  <div className={`p-3 rounded-lg mb-4 ${darkMode ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'}`}>
                    <p className={`text-xs ${darkMode ? 'text-yellow-300' : 'text-yellow-700'}`}>
                      <strong>Set up conditional split</strong><br />
                      Create a split in your flow based on a profile's properties or behavior.
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Condition Type
                    </label>
                    <select
                      value={selectedStep.config?.condition_type || 'in_list'}
                      onChange={(e) => handleUpdateStep(selectedStep.id, {
                        config: { ...selectedStep.config, condition_type: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="">Select a condition...</option>
                      <option value="in_list">If someone is in or not in a list</option>
                      <option value="event_registration">If someone registered for an event</option>
                      <option value="membership_status">If someone has a membership status</option>
                      <option value="has_boat_class">If someone has a boat class</option>
                      <option value="email_opened">What someone has done (opened email)</option>
                      <option value="email_clicked">What someone has done (clicked link)</option>
                    </select>
                  </div>

                  {selectedStep.config?.condition_type === 'in_list' && (
                    <>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          List
                        </label>
                        <select
                          value={selectedStep.config?.list_id || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, list_id: e.target.value }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="">Select a list...</option>
                          {subscriberLists.map((list) => (
                            <option key={list.id} value={list.id}>
                              {list.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          Condition
                        </label>
                        <select
                          value={selectedStep.config?.list_condition || 'in'}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, list_condition: e.target.value }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="in">Is in the list</option>
                          <option value="not_in">Is not in the list</option>
                        </select>
                      </div>
                    </>
                  )}

                  {selectedStep.config?.condition_type === 'event_registration' && (
                    <>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          Event
                        </label>
                        <select
                          value={selectedStep.config?.event_id || ''}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, event_id: e.target.value }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="">Select an event...</option>
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.eventName || 'Untitled Event'} - {new Date(event.date).toLocaleDateString()}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                          Condition
                        </label>
                        <select
                          value={selectedStep.config?.registration_condition || 'registered'}
                          onChange={(e) => handleUpdateStep(selectedStep.id, {
                            config: { ...selectedStep.config, registration_condition: e.target.value }
                          })}
                          className={`w-full px-3 py-2 rounded-lg border ${
                            darkMode
                              ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="registered">Has registered</option>
                          <option value="not_registered">Has not registered</option>
                        </select>
                      </div>
                    </>
                  )}

                  {selectedStep.config?.condition_type === 'membership_status' && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Membership Status
                      </label>
                      <select
                        value={selectedStep.config?.membership_status || 'active'}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, membership_status: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  )}

                  {selectedStep.config?.condition_type && (
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'}`}>
                      <p className={`text-xs ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                        <strong>Split Behavior:</strong> Profiles that meet this condition will take the YES path. All others will take the NO path.
                      </p>
                    </div>
                  )}
                </>
              )}

              {selectedStep.step_type === 'condition' && (
                <>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Condition Type
                    </label>
                    <select
                      value={selectedStep.config?.condition_type || 'event_registration'}
                      onChange={(e) => handleUpdateStep(selectedStep.id, {
                        config: { ...selectedStep.config, condition_type: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="event_registration">Has Registered for Event</option>
                      <option value="email_opened">Has Opened Email</option>
                      <option value="email_clicked">Has Clicked Link in Email</option>
                      <option value="in_list">Is in Subscriber List</option>
                      <option value="has_boat_class">Has Boat Class</option>
                      <option value="membership_status">Membership Status</option>
                    </select>
                  </div>

                  {selectedStep.config?.condition_type === 'event_registration' && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Select Event
                      </label>
                      <select
                        value={selectedStep.config?.event_id || ''}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, event_id: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="">Select an event...</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.eventName || 'Untitled Event'} - {new Date(event.date).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedStep.config?.condition_type === 'in_list' && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Select List
                      </label>
                      <select
                        value={selectedStep.config?.list_id || ''}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, list_id: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="">Select a list...</option>
                        {subscriberLists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedStep.config?.condition_type === 'membership_status' && (
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                        Status
                      </label>
                      <select
                        value={selectedStep.config?.membership_status || 'active'}
                        onChange={(e) => handleUpdateStep(selectedStep.id, {
                          config: { ...selectedStep.config, membership_status: e.target.value }
                        })}
                        className={`w-full px-3 py-2 rounded-lg border ${
                          darkMode
                            ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                            : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      >
                        <option value="active">Active</option>
                        <option value="expired">Expired</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  )}

                  <div className={`p-3 rounded-lg ${darkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                    <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                      <strong>Note:</strong> Conditions will split the flow into Yes/No paths. Subscribers who meet the condition continue to the next step, others are filtered out.
                    </p>
                  </div>
                </>
              )}

              {(selectedStep.step_type === 'add_to_list' || selectedStep.step_type === 'remove_from_list') && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Select List
                  </label>
                  <select
                    value={selectedStep.config?.list_id || ''}
                    onChange={(e) => handleUpdateStep(selectedStep.id, {
                      config: { ...selectedStep.config, list_id: e.target.value }
                    })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">Select a list...</option>
                    {subscriberLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Statistics
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Entered:</span>
                    <span className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      {selectedStep.total_entered}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-slate-400' : 'text-gray-600'}>Completed:</span>
                    <span className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      {selectedStep.total_completed}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Step Modal */}
      {showAddStepModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-2xl w-full rounded-xl p-6 ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Add Step
              </h2>
              {addingToBranch && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  addingToBranch.branch === 'yes'
                    ? 'bg-blue-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-300 text-gray-700'
                }`}>
                  {addingToBranch.branch === 'yes' ? 'Yes' : 'No'} Path
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {stepTypes.map((stepType) => (
                <button
                  key={stepType.type}
                  onClick={() => handleAddStep(stepType.type)}
                  className={`p-6 rounded-xl text-left transition-all ${
                    darkMode
                      ? 'bg-slate-900/50 border border-slate-700 hover:bg-slate-700/50 hover:border-slate-600'
                      : 'bg-gray-50 border border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br from-${stepType.color}-500 to-${stepType.color}-600 flex items-center justify-center`}>
                      <stepType.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className={`font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      {stepType.label}
                    </h3>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowAddStepModal(false);
                  setAddingToBranch(null);
                }}
                className={`px-4 py-2 rounded-lg ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Builder Modal */}
      {showEmailBuilder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-7xl h-[90vh] rounded-xl overflow-hidden flex flex-col ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Email Designer
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  {selectedStep?.name || 'Send Email'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (emailBuilderContent.length > 0) {
                      saveEmailContent(emailBuilderContent);
                    } else {
                      setShowEmailBuilder(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    darkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Save Design
                </button>
                <button
                  onClick={() => setShowDiscardModal(true)}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Email Builder Content */}
            <div className="flex-1 overflow-hidden">
              <EnhancedEmailPageBuilder
                content={emailBuilderContent}
                onChange={setEmailBuilderContent}
                darkMode={darkMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <EmailTemplateSelectorModal
          onClose={() => setShowTemplateSelector(false)}
          onSelect={handleTemplateSelect}
          clubId={currentClub?.clubId}
          darkMode={darkMode}
        />
      )}

      {/* Email Preview Modal */}
      {showEmailPreview && selectedStep && (selectedStep.email_content_html || selectedStep.email_content_json) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-3xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Email Preview
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                  {selectedStep.subject || 'No subject'}
                </p>
              </div>
              <button
                onClick={() => setShowEmailPreview(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Preview Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className={`rounded-lg border ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="p-4">
                  <iframe
                    srcDoc={
                      selectedStep.email_content_html ||
                      generateEmailHTML((selectedStep.email_content_json as any)?.rows || [])
                    }
                    className="w-full min-h-[600px] bg-white rounded"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    title="Email Preview"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t flex justify-between ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <button
                onClick={() => {
                  setShowEmailPreview(false);
                  openEmailBuilder();
                }}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                  darkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Edit className="w-4 h-4" />
                Edit Design
              </button>
              <button
                onClick={() => setShowEmailPreview(false)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Changes Confirmation Modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                <X className="w-5 h-5 text-orange-500" />
              </div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Discard Changes?
              </h2>
            </div>

            <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              Are you sure you want to close the email designer? Any unsaved changes will be lost.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDiscardModal(false)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Continue Editing
              </button>
              <button
                onClick={() => {
                  setShowDiscardModal(false);
                  setShowEmailBuilder(false);
                }}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Step Confirmation Modal */}
      {showDeleteStepModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Delete Step
              </h2>
            </div>

            <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              Are you sure you want to delete this step? This action cannot be undone.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteStepModal(false);
                  setStepToDelete(null);
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteStep}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Email Content Confirmation Modal */}
      {showDeleteEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Delete Email Content
              </h2>
            </div>

            <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              Are you sure you want to delete this email content? This will remove the email design from this step.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteEmailModal(false)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteEmailContent}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Content
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Settings Modal */}
      {showTriggerSettings && flow && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-xl w-full rounded-xl p-6 ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Trigger Settings
              </h2>
              <button
                onClick={() => setShowTriggerSettings(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Trigger Type
                </label>
                <select
                  value={flow.trigger_type}
                  onChange={(e) => handleUpdateFlow({ trigger_type: e.target.value as any })}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="manual">Manual</option>
                  <option value="event_registration">Event Registration</option>
                  <option value="membership_renewal">Membership Renewal</option>
                  <option value="event_published">Event Published</option>
                  <option value="form_submission">Form Submission</option>
                  <option value="time_based">Time Based</option>
                </select>
              </div>

              {flow.trigger_type === 'event_registration' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Select Event
                  </label>
                  <select
                    value={flow.trigger_config?.event_id || ''}
                    onChange={(e) => handleUpdateFlow({
                      trigger_config: { ...flow.trigger_config, event_id: e.target.value }
                    })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">Select an event...</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.eventName || 'Untitled Event'} - {new Date(event.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Flow will start automatically when someone registers for this event
                  </p>
                </div>
              )}

              {flow.trigger_type === 'time_based' && (
                <>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                      Schedule Type
                    </label>
                    <select
                      value={flow.trigger_config?.schedule_type || 'recurring'}
                      onChange={(e) => handleUpdateFlow({
                        trigger_config: { ...flow.trigger_config, schedule_type: e.target.value }
                      })}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="once">Once</option>
                      <option value="recurring">Recurring</option>
                    </select>
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    Flow will start at the scheduled time
                  </p>
                </>
              )}

              {flow.trigger_type === 'manual' && (
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                  <p className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    <strong>Manual Trigger:</strong> You can manually add subscribers to this flow from the subscribers list or when importing members.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTriggerSettings(false)}
                className={`flex-1 px-4 py-2 rounded-lg border transition-colors ${
                  darkMode
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowTriggerSettings(false);
                  addNotification('Trigger settings saved', 'success');
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
