// Admin Routing Rules & Tax Line Overrides Engine
// Allows operators to configure automatic client assignment based on sender emails/domains,
// and customize vendor-to-IRS Schedule line item mappings.

export interface IngestionRoutingRule {
  id: string;
  matchPattern: string; // e.g. "@prairiewind.com" or "john@prairiewind.com"
  matchType: 'DOMAIN' | 'EXACT_EMAIL' | 'SUBJECT_KEYWORD';
  assignToClientId: string;
  assignToClientName: string;
  defaultCategoryHint?: string;
  autoApprove: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface TaxLineOverrideRule {
  id: string;
  vendorPattern: string; // e.g. "Agri-Pro", "Tractor Supply"
  lineKeyword?: string;  // e.g. "Fence", "Hydraulic"
  targetSchedule: 'SCHEDULE_C' | 'SCHEDULE_F';
  targetLineNumber: string; // e.g. "Line 24"
  targetLineTitle: string; // e.g. "Repairs and maintenance"
  priority: number;
  enabled: boolean;
  notes?: string;
  createdAt: string;
}

const ROUTING_RULES_KEY = 'receipt_processor_routing_rules_v1';
const TAX_OVERRIDES_KEY = 'receipt_processor_tax_overrides_v1';

const INITIAL_ROUTING_RULES: IngestionRoutingRule[] = [
  {
    id: 'route-1',
    matchPattern: '@prairiewind.example.com',
    matchType: 'DOMAIN',
    assignToClientId: 'client-prairie-wind',
    assignToClientName: 'Prairie Wind Agriculture',
    defaultCategoryHint: 'Farm:General',
    autoApprove: true,
    enabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'route-2',
    matchPattern: 'finance@greenacresdairy.example.com',
    matchType: 'EXACT_EMAIL',
    assignToClientId: 'client-green-acres',
    assignToClientName: 'Green Acres Dairy Farm',
    defaultCategoryHint: 'Farm:Cows',
    autoApprove: true,
    enabled: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'route-3',
    matchPattern: 'Silver Spur',
    matchType: 'SUBJECT_KEYWORD',
    assignToClientId: 'client-silver-spur',
    assignToClientName: 'Silver Spur Ranch',
    defaultCategoryHint: 'Farm:Cows',
    autoApprove: false,
    enabled: true,
    createdAt: new Date().toISOString()
  }
];

const INITIAL_TAX_OVERRIDES: TaxLineOverrideRule[] = [
  {
    id: 'override-1',
    vendorPattern: 'Tractor Supply',
    lineKeyword: 'fencing',
    targetSchedule: 'SCHEDULE_F',
    targetLineNumber: 'Line 24',
    targetLineTitle: 'Repairs and maintenance',
    priority: 10,
    enabled: true,
    notes: 'Direct farm fence repairs rather than general supplies',
    createdAt: new Date().toISOString()
  },
  {
    id: 'override-2',
    vendorPattern: 'Agway',
    lineKeyword: '',
    targetSchedule: 'SCHEDULE_F',
    targetLineNumber: 'Line 15',
    targetLineTitle: 'Feed purchased',
    priority: 5,
    enabled: true,
    notes: 'Default Agway receipts to livestock feed',
    createdAt: new Date().toISOString()
  }
];

export function getIngestionRoutingRules(): IngestionRoutingRule[] {
  try {
    const raw = localStorage.getItem(ROUTING_RULES_KEY);
    if (!raw) {
      localStorage.setItem(ROUTING_RULES_KEY, JSON.stringify(INITIAL_ROUTING_RULES));
      return INITIAL_ROUTING_RULES;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_ROUTING_RULES;
  }
}

export function saveIngestionRoutingRule(rule: Omit<IngestionRoutingRule, 'id' | 'createdAt'>): IngestionRoutingRule {
  const current = getIngestionRoutingRules();
  const newRule: IngestionRoutingRule = {
    ...rule,
    id: `route-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString()
  };
  const updated = [newRule, ...current];
  localStorage.setItem(ROUTING_RULES_KEY, JSON.stringify(updated));
  return newRule;
}

export function deleteIngestionRoutingRule(id: string): void {
  const current = getIngestionRoutingRules();
  const updated = current.filter(r => r.id !== id);
  localStorage.setItem(ROUTING_RULES_KEY, JSON.stringify(updated));
}

export function getTaxLineOverrides(): TaxLineOverrideRule[] {
  try {
    const raw = localStorage.getItem(TAX_OVERRIDES_KEY);
    if (!raw) {
      localStorage.setItem(TAX_OVERRIDES_KEY, JSON.stringify(INITIAL_TAX_OVERRIDES));
      return INITIAL_TAX_OVERRIDES;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_TAX_OVERRIDES;
  }
}

export function saveTaxLineOverride(rule: Omit<TaxLineOverrideRule, 'id' | 'createdAt'>): TaxLineOverrideRule {
  const current = getTaxLineOverrides();
  const newRule: TaxLineOverrideRule = {
    ...rule,
    id: `override-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString()
  };
  const updated = [newRule, ...current];
  localStorage.setItem(TAX_OVERRIDES_KEY, JSON.stringify(updated));
  return newRule;
}

export function deleteTaxLineOverride(id: string): void {
  const current = getTaxLineOverrides();
  const updated = current.filter(r => r.id !== id);
  localStorage.setItem(TAX_OVERRIDES_KEY, JSON.stringify(updated));
}

/**
 * Matches an incoming email/sender against ingestion routing rules
 */
export function matchRoutingRule(senderEmail: string, subject: string = ''): IngestionRoutingRule | null {
  const rules = getIngestionRoutingRules().filter(r => r.enabled);
  const cleanEmail = senderEmail.trim().toLowerCase();
  const cleanSubj = subject.toLowerCase();

  for (const rule of rules) {
    if (rule.matchType === 'EXACT_EMAIL' && cleanEmail === rule.matchPattern.toLowerCase()) {
      return rule;
    }
    if (rule.matchType === 'DOMAIN') {
      const dom = rule.matchPattern.toLowerCase().replace('@', '');
      if (cleanEmail.endsWith(`@${dom}`) || cleanEmail.includes(dom)) {
        return rule;
      }
    }
    if (rule.matchType === 'SUBJECT_KEYWORD' && cleanSubj.includes(rule.matchPattern.toLowerCase())) {
      return rule;
    }
  }
  return null;
}
