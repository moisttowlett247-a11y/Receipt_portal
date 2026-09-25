// Client Receipt Submission & Central Queue Service
// Stores submissions in localStorage and facilitates batch export to the Operator's inbox / VM workers.

export interface ClientSubmission {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dataUrl?: string; // Base64 or object URL preview
  categoryHint?: string;
  memo?: string;
  uploadedAt: string;
  status: 'QUEUED' | 'PROCESSING' | 'SYNCED_QBO' | 'ARCHIVED';
  extractedVendor?: string;
  extractedAmount?: number;
  extractedDate?: string;
  workerNodeId?: string;
}

const STORAGE_KEY = 'receipt_processor_client_submissions_v1';

const INITIAL_DEMO_SUBMISSIONS: ClientSubmission[] = [
  {
    id: 'sub-101',
    clientId: 'client-prairie-wind',
    clientName: 'Prairie Wind Agriculture',
    clientEmail: 'billing@prairiewind.example.com',
    fileName: 'Tractor_Supply_Hydraulic_Fluid.pdf',
    fileSize: 142850,
    fileType: 'application/pdf',
    categoryHint: 'Supplies & Materials',
    memo: 'Emergency hydraulic oil for John Deere tractor',
    uploadedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    status: 'SYNCED_QBO',
    extractedVendor: 'Tractor Supply Co.',
    extractedAmount: 249.95,
    extractedDate: new Date().toISOString().split('T')[0],
    workerNodeId: 'vm-worker-1'
  },
  {
    id: 'sub-102',
    clientId: 'client-green-acres',
    clientName: 'Green Acres Dairy Farm',
    clientEmail: 'finance@greenacresdairy.example.com',
    fileName: 'Agway_Feed_Order_March.jpg',
    fileSize: 284100,
    fileType: 'image/jpeg',
    categoryHint: 'Farm:Feed',
    memo: 'Bulk dairy cow feed shipment',
    uploadedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    status: 'SYNCED_QBO',
    extractedVendor: 'Agway Farm & Home',
    extractedAmount: 1480.00,
    extractedDate: new Date().toISOString().split('T')[0],
    workerNodeId: 'vm-worker-2'
  },
  {
    id: 'sub-103',
    clientId: 'client-prairie-wind',
    clientName: 'Prairie Wind Agriculture',
    clientEmail: 'billing@prairiewind.example.com',
    fileName: 'Shell_Diesel_Bulk_Fill.png',
    fileSize: 198400,
    fileType: 'image/png',
    categoryHint: 'Automobile:Fuel',
    memo: 'Field tractor off-road diesel fill',
    uploadedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    status: 'QUEUED',
    extractedVendor: 'Shell Oil Co.',
    extractedAmount: 432.50,
    extractedDate: new Date().toISOString().split('T')[0]
  }
];

export function getClientSubmissions(): ClientSubmission[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to load submissions from localStorage:', err);
  }
  return INITIAL_DEMO_SUBMISSIONS;
}

export function saveClientSubmissions(submissions: ClientSubmission[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
  } catch (err) {
    console.warn('Failed to save submissions to localStorage:', err);
  }
}

export function addClientSubmission(item: Omit<ClientSubmission, 'id' | 'uploadedAt' | 'status'>): ClientSubmission {
  const submissions = getClientSubmissions();
  const newSubmission: ClientSubmission = {
    ...item,
    id: `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    uploadedAt: new Date().toISOString(),
    status: 'QUEUED'
  };
  const updated = [newSubmission, ...submissions];
  saveClientSubmissions(updated);
  return newSubmission;
}

export function updateSubmissionStatus(
  id: string, 
  status: ClientSubmission['status'], 
  details?: Partial<ClientSubmission>
): void {
  const submissions = getClientSubmissions();
  const updated = submissions.map(sub => {
    if (sub.id === id) {
      return {
        ...sub,
        status,
        ...details
      };
    }
    return sub;
  });
  saveClientSubmissions(updated);
}

export function deleteSubmission(id: string): void {
  const submissions = getClientSubmissions();
  const updated = submissions.filter(sub => sub.id !== id);
  saveClientSubmissions(updated);
}
