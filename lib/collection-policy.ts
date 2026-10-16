import { AppError, bounded, validateResearch } from './research';

export function reference(value: unknown, name: string) {
  const result = bounded(value, name, 80);
  if (result && !/^[a-zA-Z0-9-]+$/.test(result)) throw new AppError(`${name} is invalid.`);
  return result || null;
}
export type WorkflowStep = { name: string; template: string; question: string };
export function validateWorkflow(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Invalid workflow.');
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.steps) || v.steps.length < 1 || v.steps.length > 3) throw new AppError('Use one to three workflow steps.');
  const steps: WorkflowStep[] = v.steps.map((step: unknown) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new AppError('Invalid workflow step.');
    const s = step as Record<string, unknown>;
    const input = validateResearch({ template: s.template, subject: 'Workflow', question: s.question });
    return { name: bounded(s.name, 'Step name', 100, true), template: input.template, question: input.question };
  });
  const defaults=v.input as Record<string,unknown>;
  const input = {...validateResearch({ ...(defaults as object), template: steps[0].template, question: steps[0].question }),profileId:reference(defaults?.profileId,'Brand'),projectId:reference(defaults?.projectId,'Project')};
  return { name: bounded(v.name, 'Workflow name', 200, true), description: bounded(v.description, 'Description', 2000), input, steps };
}
export function reportMetadata(value: Record<string, unknown>) {
  if (value.favorite !== undefined && typeof value.favorite !== 'boolean') throw new AppError('Favorite must be true or false.');
  if (value.labels !== undefined && (!Array.isArray(value.labels) || value.labels.length > 8)) throw new AppError('Use up to eight labels.');
  const labels = value.labels === undefined ? undefined : [...new Set((value.labels as unknown[]).map(v => bounded(v, 'Label', 40, true)))];
  return { favorite: value.favorite as boolean | undefined, labels };
}
export type ReportFilters = { query: string; favorite: boolean; projectId: string; profileId: string; template: string; status: string; label: string; since: string };
export const emptyReportFilters: ReportFilters = { query: '', favorite: false, projectId: '', profileId: '', template: '', status: '', label: '', since: '' };
export function filterReports(reports: any[], f: ReportFilters) {
  const query = f.query.trim().toLocaleLowerCase();
  return reports.filter(r => (!query || `${r.title} ${r.subject} ${r.question}`.toLocaleLowerCase().includes(query))
    && (!f.favorite || r.favorite) && (!f.projectId || r.projectId === f.projectId)
    && (!f.profileId || r.profileId === f.profileId) && (!f.template || r.template === f.template)
    && (!f.status || r.status === f.status) && (!f.label || r.labels?.includes(f.label))
    && (!f.since || r.created.slice(0, 10) >= f.since));
}
export const workflowStarters = [
  { name: 'Brand audit', description: 'Positioning, competitors and strategic opportunities from public evidence.', steps: [
    { name: 'Understand the brand', template: 'brand', question: 'Audit the brand: positioning, products, messaging, public evidence and uncertainties.' },
    { name: 'Map the competition', template: 'competitors', question: 'Compare the main competitors, their positioning and evidenced differences. Build on the previous step.' },
    { name: 'Identify opportunities', template: 'custom', question: 'Synthesize the prior findings into evidence-backed strategic opportunities, trade-offs and next actions.' }
  ] },
  { name: "Four C's", description: 'Company, consumer, category and culture, with coverage limits.', steps: [
    { name: 'Company and category', template: 'category', question: 'Analyze the company and category using current public sources; distinguish facts from assumptions.' },
    { name: 'Consumer and culture', template: 'audience', question: 'Analyze consumer needs and cultural context using public evidence. Synthesize Company, Consumer, Category and Culture; do not invent panel statistics.' }
  ] },
  { name: 'Audience deep dive', description: 'Public evidence about audience needs and category behavior; not panel measurement.', steps: [
    { name: 'Audience evidence', template: 'audience', question: 'Research audience needs, language, category preferences and media behavior using attributable public evidence. State representativeness limits.' },
    { name: 'Implications for the brand', template: 'custom', question: 'Use the audience findings to recommend positioning and research questions. Separate evidence-backed conclusions from hypotheses.' }
  ] },
  { name: 'RFP pitch strategy', description: 'Brief interpretation, agency fit and differentiated pitch angles.', steps: [
    { name: 'Brief and fit', template: 'pitch', question: 'Interpret the supplied brief and agency credentials. Identify requirements, evidence gaps and go/no-go considerations without inventing private stakeholder facts.' },
    { name: 'Pitch angles and proof', template: 'pitch', question: 'Develop three distinct pitch angles grounded in the brief and prior findings, with proof points, risks and the next discovery questions.' }
  ] }
] satisfies { name: string; description: string; steps: WorkflowStep[] }[];

