/** All allowed decision tags in CrisisSim. */
export const ALLOWED_TAGS = [
  'raise_prices',
  'discount_prices',
  'negotiate_supplier',
  'switch_supplier',
  'take_loan',
  'cut_costs',
  'increase_marketing',
  'cut_marketing',
  'improve_quality',
  'reduce_quality',
  'layoffs',
  'hire_staff',
  'delay_payments',
  'pay_on_time',
  'compliance_investment',
  'ignore_compliance',
  'customer_refund',
  'deny_refund',
  'expand_branch',
  'pause_expansion',
  'upgrade_tech',
  'ignore_tech_debt',
  'employee_training',
  'ignore_training',
  'strengthen_security',
  'ignore_security',
] as const;

export type DecisionTag = (typeof ALLOWED_TAGS)[number];

/** Filter a list of strings to only include valid tags. */
export function filterValidTags(tags: string[]): DecisionTag[] {
  return tags.filter((t): t is DecisionTag =>
    (ALLOWED_TAGS as readonly string[]).includes(t)
  );
}

/** Keyword mapping for free-text → tag extraction. */
const KEYWORD_MAP: Record<DecisionTag, string[]> = {
  raise_prices: ['raise price', 'increase price', 'higher price', 'price hike', 'premium pricing', 'charge more'],
  discount_prices: ['discount', 'lower price', 'reduce price', 'cut price', 'sale', 'promotion', 'cheaper', 'affordable'],
  negotiate_supplier: ['negotiate supplier', 'talk to supplier', 'supplier deal', 'renegotiate', 'bargain with supplier', 'supplier terms'],
  switch_supplier: ['switch supplier', 'change supplier', 'new supplier', 'different supplier', 'alternative supplier'],
  take_loan: ['loan', 'borrow', 'credit', 'debt', 'bank finance', 'financing', 'take on debt', 'get credit'],
  cut_costs: ['cut cost', 'reduce cost', 'save money', 'cost cutting', 'austerity', 'cost reduction', 'tighten budget', 'belt tighten'],
  increase_marketing: ['more marketing', 'increase marketing', 'ad campaign', 'advertise', 'marketing push', 'promotion campaign', 'social media campaign'],
  cut_marketing: ['cut marketing', 'reduce marketing', 'less advertising', 'stop ads', 'pause marketing'],
  improve_quality: ['improve quality', 'better quality', 'quality improvement', 'quality control', 'premium product', 'upgrade product'],
  reduce_quality: ['reduce quality', 'lower quality', 'cut quality', 'cheaper materials', 'downgrade quality'],
  layoffs: ['layoff', 'fire staff', 'let go', 'redundancies', 'downsizing', 'terminate employees', 'workforce reduction', 'cut staff'],
  hire_staff: ['hire', 'recruit', 'new staff', 'more employees', 'expand team', 'bring on staff', 'onboard'],
  delay_payments: ['delay payment', 'postpone payment', 'late payment', 'defer payment', 'hold payment'],
  pay_on_time: ['pay on time', 'settle payment', 'clear debt', 'timely payment', 'pay suppliers'],
  compliance_investment: ['compliance', 'legal compliance', 'regulations', 'safety standards', 'meet regulations', 'follow rules'],
  ignore_compliance: ['ignore compliance', 'skip regulations', 'bypass rules', 'avoid compliance'],
  customer_refund: ['refund', 'compensate customer', 'give back money', 'money back', 'reimburse', 'customer compensation'],
  deny_refund: ['deny refund', 'refuse refund', 'no refund', 'reject claim', 'reject complaint'],
  expand_branch: ['expand', 'open new branch', 'new location', 'new office', 'new outlet', 'grow operations', 'scale up'],
  pause_expansion: ['pause expansion', 'hold expansion', 'delay expansion', 'stop growing', 'consolidate'],
  upgrade_tech: ['upgrade tech', 'new system', 'digital transformation', 'software upgrade', 'new platform', 'automation', 'technology'],
  ignore_tech_debt: ['ignore tech', 'skip upgrade', 'delay tech', 'postpone system upgrade'],
  employee_training: ['training', 'develop staff', 'workshop', 'skill development', 'upskill', 'train employees', 'learning program'],
  ignore_training: ['skip training', 'no training', 'cancel training', 'skip development'],
  strengthen_security: ['security', 'cybersecurity', 'data protection', 'protect data', 'security upgrade', 'firewall'],
  ignore_security: ['ignore security', 'skip security', 'no security investment', 'delay security'],
};

/** Extract tags from free text using keyword matching. */
export function extractTagsFromKeywords(text: string): DecisionTag[] {
  const lower = text.toLowerCase();
  const found: DecisionTag[] = [];

  for (const [tag, keywords] of Object.entries(KEYWORD_MAP) as [DecisionTag, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) {
      found.push(tag);
    }
  }

  return found;
}
