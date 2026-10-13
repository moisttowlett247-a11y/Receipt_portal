/**
 * QuickBooks Online Chart of Accounts Data Model & Directory
 * Comprehensive standardized agricultural, commercial, balance sheet, and tax schedule accounts.
 */

export interface QboAccountItem {
  id: string;
  accountNumber: string;
  name: string;
  qboType: string;
  subType: string;
  classification: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  schedule: 'SCHEDULE_F' | 'SCHEDULE_C' | 'BALANCE_SHEET' | 'FORM_1040' | 'ALL';
  line?: string;
  description?: string;
  active?: boolean;
  currentBalance?: number;
  isCustom?: boolean;
}

export const COMPREHENSIVE_STANDARD_ACCOUNTS: QboAccountItem[] = [
  // ==========================================
  // BANK & CASH ACCOUNTS (1000 - 1099)
  // ==========================================
  {
    id: 'bank-1010',
    accountNumber: '1010',
    name: 'Operating Checking (Acct ****4120)',
    qboType: 'Bank',
    subType: 'Checking',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Operating Cash',
    description: 'Primary working business checking account for operational disbursements and receipt deposits.',
    active: true,
    currentBalance: 84250.60
  },
  {
    id: 'bank-1020',
    accountNumber: '1020',
    name: 'Farm Operating & Expense Ledger',
    qboType: 'Bank',
    subType: 'CashOnHand',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Operating Ledger',
    description: 'Agricultural operational expense disbursements, fuel runs, and field cash clearing.',
    active: true,
    currentBalance: 32180.15
  },
  {
    id: 'bank-1030',
    accountNumber: '1030',
    name: 'Commercial Fleet & Fuel Account (Acct ****6021)',
    qboType: 'Bank',
    subType: 'Checking',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Fleet Checking',
    description: 'Dedicated commercial fleet, diesel transport, and freight logistics operating fund.',
    active: true,
    currentBalance: 15400.00
  },
  {
    id: 'bank-1040',
    accountNumber: '1040',
    name: 'Agricultural Payroll Reserve',
    qboType: 'Bank',
    subType: 'Savings',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Payroll Reserve',
    description: 'Dedicated farm labor payroll, contractor distributions, and tax withholding reserve.',
    active: true,
    currentBalance: 24500.00
  },
  {
    id: 'bank-1050',
    accountNumber: '1050',
    name: 'Grain & Crop Sales Settlement Escrow',
    qboType: 'Bank',
    subType: 'MoneyMarket',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Escrow Reserve',
    description: 'Seasonal grain elevator harvest settlements, commodity escrow, and forward contract clearing.',
    active: true,
    currentBalance: 112000.00
  },
  {
    id: 'bank-1060',
    accountNumber: '1060',
    name: 'Livestock Trading & Auction Cash Ledger',
    qboType: 'Bank',
    subType: 'Checking',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Auction Cash',
    description: 'Livestock auction ring settlements, feeder calf purchasing, and sale barn clearing account.',
    active: true,
    currentBalance: 41850.25
  },
  {
    id: 'bank-1070',
    accountNumber: '1070',
    name: 'Petty Cash & Field Till',
    qboType: 'Bank',
    subType: 'CashOnHand',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Petty Cash',
    description: 'On-farm cash box, field hardware pickups, and minor cash disbursements.',
    active: true,
    currentBalance: 1250.00
  },

  // ==========================================
  // CURRENT ASSETS & INVENTORY (1100 - 1499)
  // ==========================================
  {
    id: 'ast-1100',
    accountNumber: '1100',
    name: 'Accounts Receivable (A/R)',
    qboType: 'Accounts Receivable',
    subType: 'AccountsReceivable',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'A/R',
    description: 'Outstanding customer invoices, custom farming billing, and elevator contracts pending payment.',
    active: true,
    currentBalance: 18900.00
  },
  {
    id: 'ast-1200',
    accountNumber: '1200',
    name: 'Undeposited Funds / Payment Clearing',
    qboType: 'Other Current Asset',
    subType: 'UndepositedFunds',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Undeposited Funds',
    description: 'Scanned checks, cash receipts, and customer payments received prior to bank deposit.',
    active: true,
    currentBalance: 4850.00
  },
  {
    id: 'ast-1310',
    accountNumber: '1310',
    name: 'Inventory Asset - Grain & Harvested Crops',
    qboType: 'Other Current Asset',
    subType: 'Inventory',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Crop Inventory',
    description: 'Stored corn, soybeans, wheat, and bulk grain in on-farm bins or commercial storage.',
    active: true,
    currentBalance: 145000.00
  },
  {
    id: 'ast-1320',
    accountNumber: '1320',
    name: 'Inventory Asset - Cattle & Livestock Held for Sale',
    qboType: 'Other Current Asset',
    subType: 'Inventory',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Livestock Inventory',
    description: 'Market-ready feeder steers, market hogs, heifers, and livestock raised or bought for sale.',
    active: true,
    currentBalance: 89000.00
  },
  {
    id: 'ast-1330',
    accountNumber: '1330',
    name: 'Inventory Asset - Feed & Bulk Hay Reserves',
    qboType: 'Other Current Asset',
    subType: 'Inventory',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Feed Inventory',
    description: 'Bulk silage, round hay bales, alfalfa squares, distiller grains, and mineral inventories.',
    active: true,
    currentBalance: 27500.00
  },
  {
    id: 'ast-1340',
    accountNumber: '1340',
    name: 'Inventory Asset - Fertilizer & Chemical Reserves',
    qboType: 'Other Current Asset',
    subType: 'Inventory',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Chemical Inventory',
    description: 'Pre-purchased bulk chemical, liquid 28% nitrogen, dry potash, and spring seed stock.',
    active: true,
    currentBalance: 38200.00
  },
  {
    id: 'ast-1410',
    accountNumber: '1410',
    name: 'Prepaid Farm Insurance & Policies',
    qboType: 'Other Current Asset',
    subType: 'PrepaidExpenses',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Prepaids',
    description: 'Prepaid multi-peril crop insurance, commercial liability, and machinery floater premiums.',
    active: true,
    currentBalance: 12400.00
  },

  // ==========================================
  // FIXED ASSETS & PROPERTY (1500 - 1999)
  // ==========================================
  {
    id: 'ast-1510',
    accountNumber: '1510',
    name: 'Land & Farm Real Estate Holdings',
    qboType: 'Fixed Asset',
    subType: 'Land',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Land',
    description: 'Deeded tillable acreage, timberland, pastures, and farm real estate holdings (non-depreciable).',
    active: true,
    currentBalance: 1450000.00
  },
  {
    id: 'ast-1520',
    accountNumber: '1520',
    name: 'Buildings, Barns & Storage Structures',
    qboType: 'Fixed Asset',
    subType: 'Buildings',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Buildings',
    description: 'Machinery sheds, grain bins, hoop structures, cattle barns, and heated maintenance shops.',
    active: true,
    currentBalance: 320000.00
  },
  {
    id: 'ast-1530',
    accountNumber: '1530',
    name: 'Tractors & Heavy Agricultural Machinery',
    qboType: 'Fixed Asset',
    subType: 'MachineryAndEquipment',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Machinery',
    description: 'Combines, row-crop tractors, 4WD articulators, planters, self-propelled sprayers, tillage.',
    active: true,
    currentBalance: 580000.00
  },
  {
    id: 'ast-1540',
    accountNumber: '1540',
    name: 'Commercial Trucks, Haulers & Trailers',
    qboType: 'Fixed Asset',
    subType: 'Vehicles',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Vehicles',
    description: 'Semi-truck tractors, hopper-bottom grain trailers, livestock trailers, service pickups.',
    active: true,
    currentBalance: 175000.00
  },
  {
    id: 'ast-1550',
    accountNumber: '1550',
    name: 'Breeding Livestock Herd (Depreciable Asset)',
    qboType: 'Fixed Asset',
    subType: 'OtherFixedAssets',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Breeding Herd',
    description: 'Purchased breeding cows, registered herd bulls, and dairy breeding stock subject to MACRS.',
    active: true,
    currentBalance: 95000.00
  },
  {
    id: 'ast-1560',
    accountNumber: '1560',
    name: 'Irrigation Pivots & Deep Well Systems',
    qboType: 'Fixed Asset',
    subType: 'MachineryAndEquipment',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Irrigation',
    description: 'Center-pivot irrigation towers, electric well pumps, subterranean pipelines, and flow meters.',
    active: true,
    currentBalance: 140000.00
  },
  {
    id: 'ast-1600',
    accountNumber: '1600',
    name: 'Accumulated Depreciation - Farm Property',
    qboType: 'Fixed Asset',
    subType: 'AccumulatedDepreciation',
    classification: 'Asset',
    schedule: 'BALANCE_SHEET',
    line: 'Depreciation',
    description: 'Contra-asset cumulative depreciation and Section 179 expense taken in prior tax years.',
    active: true,
    currentBalance: -385000.00
  },

  // ==========================================
  // LIABILITIES & CREDIT (2000 - 2999)
  // ==========================================
  {
    id: 'lia-2010',
    accountNumber: '2010',
    name: 'Accounts Payable (A/P)',
    qboType: 'Accounts Payable',
    subType: 'AccountsPayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'A/P',
    description: 'Outstanding vendor statements, seed co-op invoices, and ag parts dealership charge accounts.',
    active: true,
    currentBalance: 14200.00
  },
  {
    id: 'lia-2020',
    accountNumber: '2020',
    name: 'Commercial Equipment Financing (Acct ****8812)',
    qboType: 'Credit Card',
    subType: 'CreditCard',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Revolving Line',
    description: 'Machinery dealer revolving credit card and short-term equipment repair credit account.',
    active: true,
    currentBalance: 6420.50
  },
  {
    id: 'lia-2030',
    accountNumber: '2030',
    name: 'Commercial Fleet Fuel Card (Acct ****7714)',
    qboType: 'Credit Card',
    subType: 'CreditCard',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Fleet Card',
    description: 'Universal bulk fleet card for over-the-road transport diesel, gas, and DEF purchases.',
    active: true,
    currentBalance: 3840.10
  },
  {
    id: 'lia-2100',
    accountNumber: '2100',
    name: 'Agricultural Operating Line of Credit (LOC)',
    qboType: 'Other Current Liability',
    subType: 'LineOfCredit',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'LOC',
    description: 'Annual seasonal revolving bank line of credit for crop inputs, chemical, and operating expenses.',
    active: true,
    currentBalance: 65000.00
  },
  {
    id: 'lia-2210',
    accountNumber: '2210',
    name: 'Federal Payroll Taxes Payable (941/943)',
    qboType: 'Other Current Liability',
    subType: 'PayrollTaxPayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Payroll Taxes',
    description: 'Withheld employee federal income tax, employee & employer FICA/Medicare on Form 943.',
    active: true,
    currentBalance: 4120.00
  },
  {
    id: 'lia-2220',
    accountNumber: '2220',
    name: 'State Payroll & Ag Withholding Payable',
    qboType: 'Other Current Liability',
    subType: 'PayrollTaxPayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'State Payroll',
    description: 'State employee wage withholding and state unemployment contributions payable.',
    active: true,
    currentBalance: 980.00
  },
  {
    id: 'lia-2240',
    accountNumber: '2240',
    name: 'Sales & Use Tax Payable',
    qboType: 'Other Current Liability',
    subType: 'SalesTaxPayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Sales Tax',
    description: 'Collected retail sales tax and state machinery use tax payable to state revenue department.',
    active: true,
    currentBalance: 340.00
  },
  {
    id: 'lia-2300',
    accountNumber: '2300',
    name: 'Accrued Interest & Vendor Liabilities',
    qboType: 'Other Current Liability',
    subType: 'OtherCurrentLiabilities',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Accrued',
    description: 'Accrued year-end interest on land mortgages and term machinery notes payable.',
    active: true,
    currentBalance: 2150.00
  },
  {
    id: 'lia-2510',
    accountNumber: '2510',
    name: 'Long-Term Machinery & Tractor Notes Payable',
    qboType: 'Long Term Liability',
    subType: 'NotesPayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Machinery Loans',
    description: 'Multi-year term financing notes with equipment credit corporations for tractors and combines.',
    active: true,
    currentBalance: 185000.00
  },
  {
    id: 'lia-2520',
    accountNumber: '2520',
    name: 'Farm Real Estate & Land Mortgage Payable',
    qboType: 'Long Term Liability',
    subType: 'MortgagePayable',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'Mortgage',
    description: 'Long-term 20/30-year first mortgage notes secured by deeded agricultural farmland.',
    active: true,
    currentBalance: 420000.00
  },
  {
    id: 'lia-2530',
    accountNumber: '2530',
    name: 'USDA / FSA Direct Agricultural Loan',
    qboType: 'Long Term Liability',
    subType: 'OtherLongTermLiabilities',
    classification: 'Liability',
    schedule: 'BALANCE_SHEET',
    line: 'FSA Loan',
    description: 'Farm Service Agency (USDA) direct agricultural development and conservation note.',
    active: true,
    currentBalance: 75000.00
  },

  // ==========================================
  // EQUITY (3000 - 3999)
  // ==========================================
  {
    id: 'eq-3010',
    accountNumber: '3010',
    name: "Owner's Capital / Equity",
    qboType: 'Equity',
    subType: 'OwnersEquity',
    classification: 'Equity',
    schedule: 'BALANCE_SHEET',
    line: 'Equity',
    description: 'Cumulative owner capital contributions and invested personal funds in farm operations.',
    active: true,
    currentBalance: 980000.00
  },
  {
    id: 'eq-3020',
    accountNumber: '3020',
    name: "Owner's Draws & Personal Distributions",
    qboType: 'Equity',
    subType: 'PartnerDraw',
    classification: 'Equity',
    schedule: 'BALANCE_SHEET',
    line: 'Draws',
    description: 'Non-deductible personal withdrawals taken by owner for family living and non-business expenses.',
    active: true,
    currentBalance: -45000.00
  },
  {
    id: 'eq-3100',
    accountNumber: '3100',
    name: 'Retained Earnings',
    qboType: 'Equity',
    subType: 'RetainedEarnings',
    classification: 'Equity',
    schedule: 'BALANCE_SHEET',
    line: 'Retained Earnings',
    description: 'Accumulated net profit and income retained in business from all prior operational years.',
    active: true,
    currentBalance: 465000.00
  },
  {
    id: 'eq-3200',
    accountNumber: '3200',
    name: 'Opening Balance Equity',
    qboType: 'Equity',
    subType: 'OpeningBalanceEquity',
    classification: 'Equity',
    schedule: 'BALANCE_SHEET',
    line: 'Opening Equity',
    description: 'Historical setup reconciliation equity for opening bank balances and asset transfers.',
    active: true,
    currentBalance: 0
  },

  // ==========================================
  // REVENUE & INCOME (4000 - 4999)
  // ==========================================
  {
    id: 'inc-4010',
    accountNumber: '4010',
    name: 'Livestock & Cattle Market Gross Sales',
    qboType: 'Income',
    subType: 'SalesOfProductIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 1',
    description: 'Gross sales of beef cattle, feeder steers, butcher hogs, sheep, and market livestock.',
    active: true
  },
  {
    id: 'inc-4020',
    accountNumber: '4020',
    name: 'Grain, Hay & Crop Harvest Sales',
    qboType: 'Income',
    subType: 'SalesOfProductIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 2',
    description: 'Elevator settlements and direct contract sales for corn, soybeans, wheat, and baled alfalfa.',
    active: true
  },
  {
    id: 'inc-4030',
    accountNumber: '4030',
    name: 'Custom Hire & Contract Machine Income',
    qboType: 'Income',
    subType: 'ServiceFeeIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 7',
    description: 'Revenue earned performing custom planting, combining, spraying, or hay baling for neighboring farms.',
    active: true
  },
  {
    id: 'inc-4040',
    accountNumber: '4040',
    name: 'USDA / FSA Government Program Payments',
    qboType: 'Income',
    subType: 'OtherPrimaryIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 4',
    description: 'Federal agricultural subsidies, ARC/PLC payments, CRP conservation rents, and disaster assistance.',
    active: true
  },
  {
    id: 'inc-4050',
    accountNumber: '4050',
    name: 'Crop Insurance & Disaster Indemnity Proceeds',
    qboType: 'Income',
    subType: 'OtherPrimaryIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 6',
    description: 'Proceeds received from federal crop revenue protection, hail damage policies, or livestock disaster aid.',
    active: true
  },
  {
    id: 'inc-4100',
    accountNumber: '4100',
    name: 'Commercial Product & Freight Gross Sales',
    qboType: 'Income',
    subType: 'SalesOfProductIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_C',
    line: 'Schedule C Line 1',
    description: 'Commercial commercial goods, merchandise, freight hauling receipts, and trucking billings.',
    active: true
  },
  {
    id: 'inc-4200',
    accountNumber: '4200',
    name: 'Professional Services & Consulting Income',
    qboType: 'Income',
    subType: 'ServiceFeeIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_C',
    line: 'Schedule C Line 1',
    description: 'Agronomy consulting, farm management advisory billing, and professional technical fees.',
    active: true
  },
  {
    id: 'inc-4300',
    accountNumber: '4300',
    name: 'Other Farm & Miscellaneous Business Revenue',
    qboType: 'Income',
    subType: 'OtherPrimaryIncome',
    classification: 'Revenue',
    schedule: 'SCHEDULE_F',
    line: 'Schedule F Line 8',
    description: 'Patronage dividends from farm co-ops, fuel tax refunds, pasture rental receipts, and scrap sales.',
    active: true
  },

  // ==========================================
  // COST OF GOODS SOLD (5000 - 5999)
  // ==========================================
  {
    id: 'cogs-5010',
    accountNumber: '5010',
    name: 'Feed Purchased (Grain, Silage, Supplements)',
    qboType: 'Cost of Goods Sold',
    subType: 'SuppliesMaterialsCogs',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 14',
    description: 'Bulk grain, distillers grain, protein tubs, mineral supplements, and baled hay fed to livestock.',
    active: true
  },
  {
    id: 'cogs-5020',
    accountNumber: '5020',
    name: 'Fertilizers and Lime (Anhydrous, Dry, Liquid)',
    qboType: 'Cost of Goods Sold',
    subType: 'SuppliesMaterialsCogs',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 15',
    description: 'Commercial dry potash, phosphorus, anhydrous ammonia, liquid 28/32% nitrogen, and field agricultural lime.',
    active: true
  },
  {
    id: 'cogs-5030',
    accountNumber: '5030',
    name: 'Seeds and Plants Purchased (Hybrid Seed, Cover Crop)',
    qboType: 'Cost of Goods Sold',
    subType: 'SuppliesMaterialsCogs',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 23',
    description: 'Certified hybrid seed corn, seed soybeans, alfalfa seed, cover crop mixes, and pasture grass seed.',
    active: true
  },
  {
    id: 'cogs-5040',
    accountNumber: '5040',
    name: 'Chemicals and Crop Protectants (Herbicides, Insecticides)',
    qboType: 'Cost of Goods Sold',
    subType: 'SuppliesMaterialsCogs',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 11',
    description: 'Pre-emerge and post-emerge herbicides, fungicides, insecticides, crop adjuvants, and surfactants.',
    active: true
  },
  {
    id: 'cogs-5050',
    accountNumber: '5050',
    name: 'Breeding Fees & Artificial Insemination Supplies',
    qboType: 'Cost of Goods Sold',
    subType: 'OtherCostsOfServiceCos',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 28',
    description: 'AI semen straws, nitrogen tank refills, synchronization drugs, vet breeding fees, and pregnancy check testing.',
    active: true
  },
  {
    id: 'cogs-5060',
    accountNumber: '5060',
    name: 'Freight and Trucking (Livestock & Grain Hauling)',
    qboType: 'Cost of Goods Sold',
    subType: 'ShippingFreightDeliveryCos',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 16',
    description: 'Third-party semi-truck freight paid to haul grain to river terminals or livestock to processing plants.',
    active: true
  },
  {
    id: 'cogs-5070',
    accountNumber: '5070',
    name: 'Custom Hire Machine Work (Planting & Combining)',
    qboType: 'Cost of Goods Sold',
    subType: 'CostOfLaborCos',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 13',
    description: 'Third-party custom combines, aerial plane spraying, custom forage chopping, and manure spreading services.',
    active: true
  },
  {
    id: 'cogs-5080',
    accountNumber: '5080',
    name: 'Direct Field & Production Labor COGS',
    qboType: 'Cost of Goods Sold',
    subType: 'CostOfLaborCos',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 20',
    description: 'Direct seasonal labor and combine operator wages directly attached to crop planting and harvest operations.',
    active: true
  },

  // ==========================================
  // OPERATING EXPENSES (6000 - 6999)
  // ==========================================
  {
    id: 'exp-6010',
    accountNumber: '6010',
    name: 'Car and Truck Expenses (Mileage & Service)',
    qboType: 'Expense',
    subType: 'Auto',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 10',
    description: 'Farm work trucks, service pickups, mileage log deductions, tires, brake jobs, and oil changes.',
    active: true
  },
  {
    id: 'exp-6020',
    accountNumber: '6020',
    name: 'Gasoline, Fuel, and Oil (Bulk Diesel & DEF)',
    qboType: 'Expense',
    subType: 'Auto',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 17',
    description: 'Off-road dyed diesel for tractors, on-road fuel, engine oils, hydraulic fluid, grease, and DEF fluid.',
    active: true
  },
  {
    id: 'exp-6030',
    accountNumber: '6030',
    name: 'Repairs and Maintenance - Machinery & Tractors',
    qboType: 'Expense',
    subType: 'RepairMaintenance',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 22',
    description: 'Dealership tractor repairs, combine belts, hydraulic hoses, bearings, planter meters, and welding service.',
    active: true
  },
  {
    id: 'exp-6040',
    accountNumber: '6040',
    name: 'Repairs and Maintenance - Barns, Fences & Buildings',
    qboType: 'Expense',
    subType: 'RepairMaintenance',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 22',
    description: 'Pasture barbed wire, steel posts, corral gates, grain bin auger repairs, and machine shed maintenance.',
    active: true
  },
  {
    id: 'exp-6050',
    accountNumber: '6050',
    name: 'Supplies Purchased (Baler Twine, Net Wrap, Tools)',
    qboType: 'Expense',
    subType: 'Supplies',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 25',
    description: 'Round baler net wrap, sisal twine, silage wrap, ear tags, grease tubes, shop hardware, and hand tools.',
    active: true
  },
  {
    id: 'exp-6060',
    accountNumber: '6060',
    name: 'Utilities - Electricity & Farm Power',
    qboType: 'Expense',
    subType: 'Utilities',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 27',
    description: 'Electric power utility for grain bin drying fans, heated shops, calving barns, and automatic waterers.',
    active: true
  },
  {
    id: 'exp-6070',
    accountNumber: '6070',
    name: 'Utilities - Water, Irrigation Pumping & Well Power',
    qboType: 'Expense',
    subType: 'Utilities',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 27',
    description: 'Rural water district fees, pasture deep well electricity, and commercial irrigation pump electric charges.',
    active: true
  },
  {
    id: 'exp-6080',
    accountNumber: '6080',
    name: 'Utilities - Propane & Heating Fuel',
    qboType: 'Expense',
    subType: 'Utilities',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 27',
    description: 'LP bulk propane for high-temperature continuous batch grain dryers and shop furnace heating.',
    active: true
  },
  {
    id: 'exp-6090',
    accountNumber: '6090',
    name: 'Telephone & Internet Communications',
    qboType: 'Expense',
    subType: 'Utilities',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 27',
    description: 'Farm headquarters high-speed internet, cellular field communication, and RTK GPS tractor guidance data subscriptions.',
    active: true
  },
  {
    id: 'exp-6100',
    accountNumber: '6100',
    name: 'Insurance (Other than Health) - Farm Property & Liability',
    qboType: 'Expense',
    subType: 'Insurance',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 18',
    description: 'Multi-peril farm property, comprehensive farm general liability, and inland marine machinery floater.',
    active: true
  },
  {
    id: 'exp-6110',
    accountNumber: '6110',
    name: 'Insurance - Crop Hail & Revenue Protection',
    qboType: 'Expense',
    subType: 'Insurance',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 18',
    description: 'Federal multi-peril crop revenue insurance premiums, SCO/ECO endorsements, and supplemental hail coverage.',
    active: true
  },
  {
    id: 'exp-6120',
    accountNumber: '6120',
    name: 'Interest: Mortgage on Farm Real Estate',
    qboType: 'Expense',
    subType: 'InterestPaid',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 19',
    description: 'Interest portion of long-term mortgage payments on agricultural land, deeded pasture, and farm structures.',
    active: true
  },
  {
    id: 'exp-6130',
    accountNumber: '6130',
    name: 'Interest: Operating Notes & Equipment Loans',
    qboType: 'Expense',
    subType: 'InterestPaid',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 19',
    description: 'Finance interest accrued on seasonal crop operating loans, fertilizer prepay notes, and tractor financing.',
    active: true
  },
  {
    id: 'exp-6140',
    accountNumber: '6140',
    name: 'Labor Hired (Agricultural & Farm Hand Payroll)',
    qboType: 'Expense',
    subType: 'PayrollExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 20',
    description: 'Wages and hourly pay paid to regular full-time and seasonal hired agricultural farm workers.',
    active: true
  },
  {
    id: 'exp-6150',
    accountNumber: '6150',
    name: 'Pension and Profit-Sharing Plans (Employee)',
    qboType: 'Expense',
    subType: 'PayrollExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 21',
    description: 'Employer matching contributions into SEP-IRA or qualified retirement plans for full-time farm employees.',
    active: true
  },
  {
    id: 'exp-6160',
    accountNumber: '6160',
    name: 'Rent and Lease - Machinery & Heavy Equipment',
    qboType: 'Expense',
    subType: 'EquipmentRental',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 24',
    description: 'Annual lease payments or hourly rental charges for tractors, high-clearance sprayers, and construction tools.',
    active: true
  },
  {
    id: 'exp-6170',
    accountNumber: '6170',
    name: 'Rent and Lease - Farm Land & Pasture Ground',
    qboType: 'Expense',
    subType: 'RentOrLeaseOfBuildings',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 24',
    description: 'Cash rent per acre paid to landlords for tillable crop ground, summer pasture grazing, and hay ground.',
    active: true
  },
  {
    id: 'exp-6180',
    accountNumber: '6180',
    name: 'Storage and Warehousing (Grain Elevator Storage)',
    qboType: 'Expense',
    subType: 'RentOrLeaseOfBuildings',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 24',
    description: 'Grain elevator monthly storage tariffs, shrink assessments, and commercial grain drying fee deductions.',
    active: true
  },
  {
    id: 'exp-6190',
    accountNumber: '6190',
    name: 'Taxes - Real Estate & Property Taxes on Farm Ground',
    qboType: 'Expense',
    subType: 'TaxesPaid',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 26',
    description: 'County real estate property taxes assessed on farmland, grain facilities, and farm buildings.',
    active: true
  },
  {
    id: 'exp-6200',
    accountNumber: '6200',
    name: 'Taxes - Employer Payroll & FICA Taxes',
    qboType: 'Expense',
    subType: 'TaxesPaid',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 26',
    description: 'Employer share of Social Security and Medicare taxes reported on annual Form 943 agricultural return.',
    active: true
  },
  {
    id: 'exp-6210',
    accountNumber: '6210',
    name: 'Veterinary, Breeding, and Medicine for Livestock',
    qboType: 'Expense',
    subType: 'OtherBusinessExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 28',
    description: 'Herd health vaccines, pour-on dewormers, antibiotics, emergency veterinary calls, and surgical care.',
    active: true
  },
  {
    id: 'exp-6220',
    accountNumber: '6220',
    name: 'Conservation Expenses (Terraces, Waterways, Soil)',
    qboType: 'Expense',
    subType: 'OtherBusinessExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 12',
    description: 'Soil conservation practices, broad-base terrace maintenance, grassed waterway grading, and drainage tiling.',
    active: true
  },
  {
    id: 'exp-6230',
    accountNumber: '6230',
    name: 'Advertising & Marketing Promotions',
    qboType: 'Expense',
    subType: 'AdvertisingPromotional',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 8',
    description: 'Registered bull production sale catalogs, farm signage, digital advertising, and livestock print classifieds.',
    active: true
  },
  {
    id: 'exp-6240',
    accountNumber: '6240',
    name: 'Commissions and Brokerage Fees',
    qboType: 'Expense',
    subType: 'CommissionsAndFees',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 10',
    description: 'Grain futures hedging broker commissions and livestock sale barn head commissions.',
    active: true
  },
  {
    id: 'exp-6250',
    accountNumber: '6250',
    name: 'Contract Labor (1099 Independent Contractors)',
    qboType: 'Expense',
    subType: 'CostOfLabor',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 11',
    description: 'Payments to independent fence builders, custom operators, mechanics, and 1099 contractors.',
    active: true
  },
  {
    id: 'exp-6260',
    accountNumber: '6260',
    name: 'Legal and Professional Fees (Attorneys & Advisors)',
    qboType: 'Expense',
    subType: 'LegalProfessionalFees',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 17',
    description: 'Attorney fees for land lease agreements, farm succession planning, and water rights legal counsel.',
    active: true
  },
  {
    id: 'exp-6270',
    accountNumber: '6270',
    name: 'Accounting, Bookkeeping & Tax Prep Services',
    qboType: 'Expense',
    subType: 'LegalProfessionalFees',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 17',
    description: 'CPA tax return preparation (Schedule F/C), monthly QuickBooks reconciliation, and payroll compliance.',
    active: true
  },
  {
    id: 'exp-6280',
    accountNumber: '6280',
    name: 'Office Expense & Administrative Supplies',
    qboType: 'Expense',
    subType: 'OfficeGeneralAdministrativeExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 18',
    description: 'Farm office computer supplies, receipt scanning software, cloud subscriptions, printer toner, paper.',
    active: true
  },
  {
    id: 'exp-6290',
    accountNumber: '6290',
    name: 'Travel, Meals & Agricultural Convention Lodging',
    qboType: 'Expense',
    subType: 'TravelMeals',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 24',
    description: 'Commodity conferences, cattle conventions, machinery trade shows, lodging, and 50% business meals.',
    active: true
  },
  {
    id: 'exp-6300',
    accountNumber: '6300',
    name: 'Dues, Memberships & Farm Bureau Fees',
    qboType: 'Expense',
    subType: 'DuesSubscriptions',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 32',
    description: 'Annual Farm Bureau dues, Cattlemen\'s Association memberships, commodity checkoff fees, and ag journals.',
    active: true
  },
  {
    id: 'exp-6310',
    accountNumber: '6310',
    name: 'Bank Charges & Merchant Processing Fees',
    qboType: 'Expense',
    subType: 'BankCharges',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 32',
    description: 'Operating checking monthly service fees, wire transfer charges, and card transaction fees.',
    active: true
  },
  {
    id: 'exp-6320',
    accountNumber: '6320',
    name: 'Small Tools & De Minimis Farm Equipment (< $2,500)',
    qboType: 'Expense',
    subType: 'Supplies',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 32',
    description: 'Shop power tools, socket sets, heavy chains, electric fence energizers, and items expensed under safe harbor.',
    active: true
  },
  {
    id: 'exp-6330',
    accountNumber: '6330',
    name: 'Other Farm Expenses (Miscellaneous Deductions)',
    qboType: 'Expense',
    subType: 'OtherBusinessExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 32',
    description: 'Miscellaneous itemized deductible Schedule F Line 32 expenses not classified elsewhere.',
    active: true
  },
  {
    id: 'exp-6340',
    accountNumber: '6340',
    name: 'Other Business Expenses (Miscellaneous Deductions)',
    qboType: 'Expense',
    subType: 'OtherBusinessExpenses',
    classification: 'Expense',
    schedule: 'SCHEDULE_C',
    line: 'Line 27',
    description: 'Miscellaneous itemized deductible Schedule C Line 27 general commercial business deductions.',
    active: true
  },

  // ==========================================
  // OTHER EXPENSE & INCOME (7000 - 7999)
  // ==========================================
  {
    id: 'oth-7010',
    accountNumber: '7010',
    name: 'Depreciation Expense & Section 179 Deduction',
    qboType: 'Other Expense',
    subType: 'Depreciation',
    classification: 'Expense',
    schedule: 'SCHEDULE_F',
    line: 'Line 14',
    description: 'Annual tax depreciation from IRS Form 4562, Section 179 immediate expensing, and bonus depreciation.',
    active: true
  },
  {
    id: 'oth-7100',
    accountNumber: '7100',
    name: 'Interest Income on Operating Reserves',
    qboType: 'Other Income',
    subType: 'InterestEarned',
    classification: 'Revenue',
    schedule: 'FORM_1040',
    line: 'Interest Income',
    description: 'Interest earned on farm operating reserve balances and high-yield escrow accounts.',
    active: true
  },
  {
    id: 'oth-7200',
    accountNumber: '7200',
    name: 'Gain or Loss on Sale of Farm Capital Assets',
    qboType: 'Other Income',
    subType: 'OtherMiscellaneousIncome',
    classification: 'Revenue',
    schedule: 'FORM_1040',
    line: 'Form 4797',
    description: 'Capital gains or losses recognized on machinery trade-ins, equipment sales, and culled breeding cows.',
    active: true
  }
];

export const QBO_CHART_CATEGORIES = [
  { key: 'ALL', label: 'All Accounts', icon: 'Layers' },
  { key: 'Bank', label: 'Bank & Cash', icon: 'Wallet' },
  { key: 'Asset', label: 'Assets', icon: 'Landmark' },
  { key: 'Liability', label: 'Liabilities', icon: 'CreditCard' },
  { key: 'Equity', label: 'Equity', icon: 'Scale' },
  { key: 'Revenue', label: 'Income & Revenue', icon: 'TrendingUp' },
  { key: 'COGS', label: 'Cost of Goods (COGS)', icon: 'Boxes' },
  { key: 'Expense', label: 'Expenses', icon: 'Receipt' },
  { key: 'SCHEDULE_F', label: 'Schedule F (Farm)', icon: 'Wheat' },
  { key: 'SCHEDULE_C', label: 'Schedule C (Business)', icon: 'Building' }
] as const;

/**
 * Return all accounts merged with any live or custom accounts passed in.
 */
export function getAllStandardQboAccounts(liveOrCustomAccounts: QboAccountItem[] = []): QboAccountItem[] {
  if (!liveOrCustomAccounts || liveOrCustomAccounts.length === 0) {
    return COMPREHENSIVE_STANDARD_ACCOUNTS;
  }

  // Deduplicate by name and id
  const existingNames = new Set(liveOrCustomAccounts.map(a => a.name.toLowerCase()));
  const merged = [
    ...liveOrCustomAccounts,
    ...COMPREHENSIVE_STANDARD_ACCOUNTS.filter(std => !existingNames.has(std.name.toLowerCase()))
  ];

  return merged;
}

/**
 * Filter and search QuickBooks Chart of Accounts
 */
export function searchQboAccounts(
  accounts: QboAccountItem[],
  query: string,
  categoryFilter: string = 'ALL'
): QboAccountItem[] {
  const cleanQ = query.trim().toLowerCase();

  return accounts.filter(acc => {
    // Category check
    if (categoryFilter !== 'ALL') {
      if (categoryFilter === 'Bank' && acc.qboType !== 'Bank') return false;
      if (categoryFilter === 'Asset' && acc.classification !== 'Asset') return false;
      if (categoryFilter === 'Liability' && acc.classification !== 'Liability') return false;
      if (categoryFilter === 'Equity' && acc.classification !== 'Equity') return false;
      if (categoryFilter === 'Revenue' && acc.classification !== 'Revenue') return false;
      if (categoryFilter === 'COGS' && acc.qboType !== 'Cost of Goods Sold') return false;
      if (categoryFilter === 'Expense' && acc.classification !== 'Expense') return false;
      if (categoryFilter === 'SCHEDULE_F' && acc.schedule !== 'SCHEDULE_F') return false;
      if (categoryFilter === 'SCHEDULE_C' && acc.schedule !== 'SCHEDULE_C') return false;
    }

    if (!cleanQ) return true;

    // Search against multiple fields: name, accountNumber, qboType, subType, schedule, line, description
    const matchName = acc.name.toLowerCase().includes(cleanQ);
    const matchNum = acc.accountNumber?.toLowerCase().includes(cleanQ);
    const matchType = acc.qboType?.toLowerCase().includes(cleanQ);
    const matchSubType = acc.subType?.toLowerCase().includes(cleanQ);
    const matchLine = acc.line?.toLowerCase().includes(cleanQ);
    const matchDesc = acc.description?.toLowerCase().includes(cleanQ);
    const matchSched = acc.schedule?.toLowerCase().includes(cleanQ);

    return matchName || matchNum || matchType || matchSubType || matchLine || matchDesc || matchSched;
  });
}
