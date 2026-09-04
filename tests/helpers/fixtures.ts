import type {
  FinalReportResponse,
  InitialTurnResponse,
  NextTurnResponse,
} from '@/lib/llm/schemas';

const NARRATIVE =
  'A shipment of raw materials has been held at customs in Alexandria for eleven days and the ' +
  'delay has already cost two retail contracts. The finance team is warning that another week ' +
  'of idle production lines will eat through most of the quarter reserve.';

// Every fixture is rebuilt from scratch on each call: tests mutate what they
// are given, and a shared array would leak those edits into the next test.
const options = () => [
  { id: 'A' as const, text: 'Negotiate new terms with the current supplier', risk: 'low' as const, tags: ['negotiate_supplier'] },
  { id: 'B' as const, text: 'Switch to a domestic supplier at a higher unit cost', risk: 'medium' as const, tags: ['switch_supplier'] },
  { id: 'C' as const, text: 'Take a bridging loan and keep production running', risk: 'high' as const, tags: ['take_loan'] },
  { id: 'D' as const, text: 'Cut discretionary spending across every department', risk: 'medium' as const, tags: ['cut_costs'] },
];

const characterMessages = () => [
  { from: 'CFO' as const, message: 'We are burning through the reserve faster than the plan assumed.' },
  { from: 'OPS' as const, message: 'Two production lines are idle and the crew is asking questions.' },
  { from: 'HR' as const, message: 'Staff are worried about the overtime freeze taking effect.' },
];

export function turnFixture(turnNumber = 1) {
  return {
    turnNumber,
    title: 'Customs Delay Bites',
    narrative: NARRATIVE,
    characterMessages: characterMessages(),
    newsOrSocial: { type: 'news' as const, text: 'Import backlog at Alexandria port hits a two-year high.' },
    options: options(),
  };
}

export function initialTurnFixture(): InitialTurnResponse {
  return {
    companyProfile: {
      name: 'Nile Home Goods',
      industry: 'Retail',
      size: 'Small',
      location: 'Cairo, Egypt',
      startingSituation:
        'A twelve-store homeware chain squeezed between rising import costs and a new discount rival.',
    },
    competitor: { name: 'Delta Living', strategy: 'price_war' },
    turn: turnFixture(1),
  };
}

export function nextTurnFixture(turnNumber = 2): NextTurnResponse {
  return {
    turn: turnFixture(turnNumber),
    coach: {
      feedback:
        'Protecting the supplier relationship kept the shelves stocked, but it left the cost base untouched.',
      whyItMatters: 'Supply continuity buys time; it does not fix an unsustainable burn rate.',
    },
  };
}

export function finalReportFixture(): FinalReportResponse {
  return {
    overallScore: 64,
    skillScores: { finance: 60, leadership: 70, risk: 55, communication: 65, ethics: 80 },
    endingType: 'survival',
    strengths: ['Kept the supply chain intact under pressure'],
    improvements: ['Act on the cost base earlier'],
    learningPath: ['Working capital management', 'Supplier negotiation'],
    summary:
      'The company came through ten difficult turns intact. Supply decisions were sound and ethics ' +
      'were never traded away, but the cost base was addressed too late to build a real buffer.',
  };
}
