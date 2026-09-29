import React, { useState } from 'react';
import {
  Car,
  ShieldCheck,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Award,
  TrendingUp,
  Download,
  CheckCircle2,
  FileCheck,
  Lock
} from 'lucide-react';
import { 
  MileageTrip, 
  TaxExemptionCertificate, 
  QuarterlyEstimate,
  getMileageTrips, 
  saveMileageTrip, 
  deleteMileageTrip, 
  getExemptionCertificates, 
  saveExemptionCertificate, 
  deleteExemptionCertificate, 
  calculateQuarterlyEstimates, 
  IRS_2026_MILEAGE_RATE,
  exportMileageLogCSV
} from '../clientTaxFeaturesService';
import { ClientAccountSession } from '../types';

interface ClientTaxAdditionsHubProps {
  clientSession: ClientAccountSession | null;
  totalReceiptDeductions: number;
  onSubscribeClick?: () => void;
  onActivateKeyClick?: () => void;
  onMileageChange?: () => void;
}

export const ClientTaxAdditionsHub: React.FC<ClientTaxAdditionsHubProps> = ({
  clientSession,
  totalReceiptDeductions,
  onSubscribeClick,
  onActivateKeyClick,
  onMileageChange
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'mileage' | 'exemptions' | 'quarterly'>('mileage');
  const [mileageList, setMileageList] = useState<MileageTrip[]>(() => getMileageTrips(clientSession?.id));
  const [exemptionList, setExemptionList] = useState<TaxExemptionCertificate[]>(() => getExemptionCertificates(clientSession?.id));

  // New Mileage Modal State
  const [showAddMileageModal, setShowAddMileageModal] = useState(false);
  const [newTripDate, setNewTripDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTripPurpose, setNewTripPurpose] = useState('');
  const [newTripSchedule, setNewTripSchedule] = useState<'SCHEDULE_C' | 'SCHEDULE_F'>('SCHEDULE_F');
  const [newTripMiles, setNewTripMiles] = useState<number>(25);
  const [newTripVehicle, setNewTripVehicle] = useState('Farm Work Truck / Utility');
  const [newTripNotes, setNewTripNotes] = useState('');

  // New Exemption Certificate Modal State
  const [showAddExemptionModal, setShowAddExemptionModal] = useState(false);
  const [newCertTitle, setNewCertTitle] = useState('');
  const [newCertType, setNewCertType] = useState<TaxExemptionCertificate['exemptionType']>('AGRICULTURAL_FARM');
  const [newCertState, setNewCertState] = useState('IA');
  const [newCertNumber, setNewCertNumber] = useState('');
  const [newCertIssuedTo, setNewCertIssuedTo] = useState(clientSession?.displayName || 'Client Entity');
  const [newCertExp, setNewCertExp] = useState('2027-12-31');
  const [newCertNotes, setNewCertNotes] = useState('');

  const isLoggedIn = Boolean(clientSession);
  const hasActivePlan = Boolean(
    clientSession && (
      clientSession.planStatus === 'ACTIVE' ||
      (clientSession.licenseKey && clientSession.licenseKey.trim().length > 0)
    )
  );

  const totalMileageDeductions = mileageList.reduce((acc, m) => acc + m.calculatedDeduction, 0);
  const totalCombinedDeductions = totalReceiptDeductions + totalMileageDeductions;
  const quarterlyProjections = calculateQuarterlyEstimates(totalCombinedDeductions, '2026');

  const handleCreateMileage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripPurpose.trim() || newTripMiles <= 0) return;

    saveMileageTrip({
      clientId: clientSession?.id || 'guest-client',
      date: newTripDate,
      purpose: newTripPurpose.trim(),
      schedule: newTripSchedule,
      miles: Number(newTripMiles),
      ratePerMile: IRS_2026_MILEAGE_RATE,
      vehicleDescription: newTripVehicle.trim(),
      notes: newTripNotes.trim()
    });

    setMileageList(getMileageTrips(clientSession?.id));
    setShowAddMileageModal(false);
    setNewTripPurpose('');
    setNewTripNotes('');
    if (onMileageChange) onMileageChange();
  };

  const handleDeleteMileage = (id: string) => {
    deleteMileageTrip(id);
    setMileageList(getMileageTrips(clientSession?.id));
    if (onMileageChange) onMileageChange();
  };

  const handleCreateExemption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCertTitle.trim() || !newCertNumber.trim()) return;

    saveExemptionCertificate({
      clientId: clientSession?.id || 'guest-client',
      title: newCertTitle.trim(),
      exemptionType: newCertType,
      state: newCertState.trim().toUpperCase(),
      certificateNumber: newCertNumber.trim(),
      issuedToName: newCertIssuedTo.trim(),
      expirationDate: newCertExp,
      notes: newCertNotes.trim(),
      verified: true
    });

    setExemptionList(getExemptionCertificates(clientSession?.id));
    setShowAddExemptionModal(false);
    setNewCertTitle('');
    setNewCertNumber('');
    setNewCertNotes('');
  };

  const handleDeleteExemption = (id: string) => {
    deleteExemptionCertificate(id);
    setExemptionList(getExemptionCertificates(clientSession?.id));
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab selection */}
      <div className="flex border-b border-stone-800 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveSubTab('mileage')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
            activeSubTab === 'mileage'
              ? 'border-amber-500 text-amber-400 bg-stone-900/70'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Car className="w-4 h-4 text-amber-400" />
          <span>Vehicle Mileage Log (IRS Line 9/10)</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/10 text-amber-400 font-mono">
            ${totalMileageDeductions.toFixed(0)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('quarterly')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
            activeSubTab === 'quarterly'
              ? 'border-emerald-500 text-emerald-400 bg-stone-900/70'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>1040-ES Quarterly Tax Meter</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-300 font-mono">
            Save ~${quarterlyProjections.totalTaxSavingsEstimate.toFixed(0)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('exemptions')}
          className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors cursor-pointer flex items-center gap-2 border-b-2 whitespace-nowrap ${
            activeSubTab === 'exemptions'
              ? 'border-sky-500 text-sky-400 bg-stone-900/70'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <FileCheck className="w-4 h-4 text-sky-400" />
          <span>Sales Tax Exemption Cards ({exemptionList.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: Vehicle Mileage Log */}
      {activeSubTab === 'mileage' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>IRS Standard Mileage Deduction Log</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
                  ${IRS_2026_MILEAGE_RATE}/mile (2026 Rate)
                </span>
              </h3>
              <p className="text-xs text-stone-300 mt-1 max-w-2xl">
                Logging business & farm travel adds directly to your Schedule C Line 9 (Car/Truck) or Schedule F Line 10 (Gasoline, Fuel & Oil) deductions without collecting gas receipts.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-sm sm:text-base font-bold font-mono text-emerald-400">
                  ${totalMileageDeductions.toFixed(2)}
                </div>
                <span className="text-[10px] text-stone-400">Total Mileage Deductions</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportMileageLogCSV(mileageList, clientSession?.displayName || 'Client')}
                  disabled={mileageList.length === 0}
                  className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Download Mileage Log (.CSV)"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Export Mileage (.CSV)</span>
                </button>
                {hasActivePlan ? (
                  <button
                    type="button"
                    onClick={() => setShowAddMileageModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Log Trip</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSubscribeClick}
                    className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-400 border border-amber-500/30 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Unlock Mileage Log</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mileage Trips Table */}
          <div className="rounded-2xl bg-stone-900/90 border border-stone-800 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-950/80 text-stone-400 text-[10px] uppercase font-mono border-b border-stone-800">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Purpose / Trip Route</th>
                    <th className="py-3 px-4">Vehicle</th>
                    <th className="py-3 px-4">IRS Target Schedule</th>
                    <th className="py-3 px-4 text-center">Miles</th>
                    <th className="py-3 px-4 text-right">Deduction</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800 text-stone-300">
                  {mileageList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-500">
                        No trips logged yet. Click "Log Trip" to add your first farm or business travel deduction.
                      </td>
                    </tr>
                  ) : (
                    mileageList.map((trip) => (
                      <tr key={trip.id} className="hover:bg-stone-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-stone-400 whitespace-nowrap">
                          {trip.date}
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-semibold text-stone-200">{trip.purpose}</div>
                          {trip.notes && <div className="text-[10px] text-stone-400 italic">{trip.notes}</div>}
                        </td>
                        <td className="py-3 px-4 text-stone-400 text-xs">
                          {trip.vehicleDescription || 'Business Vehicle'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            trip.schedule === 'SCHEDULE_F'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/30'
                              : 'bg-sky-950 text-sky-300 border border-sky-800/30'
                          }`}>
                            {trip.schedule === 'SCHEDULE_F' ? 'Sched F (Line 10)' : 'Sched C (Line 9)'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-stone-200">
                          {trip.miles} mi
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                          ${trip.calculatedDeduction.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteMileage(trip.id)}
                            className="p-1 text-stone-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete trip log"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: 1040-ES Quarterly Tax Meter */}
      {activeSubTab === 'quarterly' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-stone-900 to-stone-900 border border-emerald-500/30 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  IRS FORM 1040-ES ESTIMATED TAX SHIELD
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Estimated Tax Liability Shield & Filing Deadlines
                </h3>
                <p className="text-xs text-stone-300 max-w-2xl leading-relaxed">
                  Every ordinary and necessary business or agricultural expense reduces your taxable income dollar-for-dollar. 
                  Based on federal self-employment tax (15.3%) and standard marginal tax brackets (~10-12%), here is what your tracked expenses have shielded so far:
                </p>
              </div>

              <div className="p-4 rounded-xl bg-stone-950/80 border border-emerald-500/40 text-right shrink-0">
                <span className="text-[10px] text-stone-400 uppercase tracking-wider font-semibold">Estimated Taxes Saved</span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                  ~${quarterlyProjections.totalTaxSavingsEstimate.toFixed(2)}
                </div>
                <span className="text-[10px] text-stone-500">Across ${totalCombinedDeductions.toFixed(2)} in total deductions</span>
              </div>
            </div>
          </div>

          {/* Quarterly Deadlines Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {quarterlyProjections.deadlines.map((q) => (
              <div 
                key={q.quarter}
                className={`p-4 rounded-xl border space-y-2 relative overflow-hidden ${
                  q.isUpcoming
                    ? 'bg-amber-950/20 border-amber-500/50 shadow-lg'
                    : q.isPastDue
                    ? 'bg-stone-900/60 border-stone-800 opacity-80'
                    : 'bg-stone-900/90 border-stone-800'
                }`}
              >
                {q.isUpcoming && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-mono bg-amber-500 text-stone-950 font-bold rounded">
                    UPCOMING
                  </span>
                )}
                <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                  {q.quarter} 1040-ES Filing
                </div>
                <div className="text-sm font-semibold text-white font-mono flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  <span>{q.dueDate}</span>
                </div>
                <div className="pt-1 border-t border-stone-800 text-[11px] text-stone-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Tax Shield:</span>
                    <span className="font-mono text-emerald-400 font-bold">~${q.estimatedTaxSaved.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deduction Base:</span>
                    <span className="font-mono text-stone-300">${q.totalDeductionsShielded.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-stone-900/60 border border-stone-800 text-xs text-stone-400 space-y-1">
            <div className="flex items-center gap-1.5 text-stone-300 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>Tax Planning Tip for Sole Proprietors & Farm Operators</span>
            </div>
            <p className="leading-relaxed">
              To avoid federal underpayment penalties, farmers who receive more than two-thirds of gross income from farming can make a single estimated payment by January 15, or file and pay the entire tax by March 1. Non-farm Schedule C sole proprietors should submit quarterly vouchers using IRS Form 1040-ES.
            </p>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Sales Tax Exemption Cards */}
      {activeSubTab === 'exemptions' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-stone-900/80 border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Tax Exemption & Resale Certificates Vault</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 font-mono">
                  MOBILE AUDIT READY
                </span>
              </h3>
              <p className="text-xs text-stone-300 mt-1 max-w-2xl">
                Store and access your state agricultural exemption certificates or wholesale resale numbers directly on your mobile device when making purchases at hardware stores, farm supply dealers, or auctions.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddExemptionModal(true)}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-md shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Exemption Card</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {exemptionList.length === 0 ? (
              <div className="col-span-2 p-8 text-center rounded-2xl bg-stone-900/40 border border-stone-800 text-stone-400 space-y-2">
                <FileCheck className="w-8 h-8 text-stone-600 mx-auto" />
                <p>No tax exemption certificates saved yet.</p>
              </div>
            ) : (
              exemptionList.map((cert) => (
                <div 
                  key={cert.id}
                  className="p-5 rounded-2xl bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 shadow-md space-y-3 relative"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        cert.exemptionType === 'AGRICULTURAL_FARM'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                          : 'bg-sky-950 text-sky-300 border border-sky-800/40'
                      }`}>
                        {cert.exemptionType === 'AGRICULTURAL_FARM' ? 'STATE AGRICULTURAL EXEMPTION' : 'WHOLESALE RESALE PERMIT'}
                      </span>
                      <h4 className="text-sm font-bold text-white">{cert.title}</h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteExemption(cert.id)}
                      className="text-stone-500 hover:text-rose-400 p-1"
                      title="Delete card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-stone-950/80 border border-stone-800 font-mono text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Certificate / Tax ID:</span>
                      <span className="font-bold text-amber-400">{cert.certificateNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Issued To:</span>
                      <span className="text-stone-300 truncate max-w-[180px]">{cert.issuedToName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Jurisdiction / State:</span>
                      <span className="text-stone-300">{cert.state}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Valid Through:</span>
                      <span className="text-emerald-400">{cert.expirationDate}</span>
                    </div>
                  </div>

                  {cert.notes && (
                    <p className="text-[11px] text-stone-400 leading-relaxed italic">
                      "{cert.notes}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* MODAL: Log New Mileage Trip */}
      {showAddMileageModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Car className="w-4 h-4 text-amber-400" />
                <span>Log Vehicle Mileage Trip</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddMileageModal(false)}
                className="text-stone-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMileage} className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-400 font-semibold mb-1">Date of Trip</label>
                <input
                  type="date"
                  required
                  value={newTripDate}
                  onChange={(e) => setNewTripDate(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                />
              </div>

              <div>
                <label className="block text-stone-400 font-semibold mb-1">Business / Farm Purpose</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Round trip to Co-Op for seed grain"
                  value={newTripPurpose}
                  onChange={(e) => setNewTripPurpose(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200 placeholder:text-stone-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-400 font-semibold mb-1">Total Miles</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={newTripMiles}
                    onChange={(e) => setNewTripMiles(parseFloat(e.target.value) || 0)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-stone-400 font-semibold mb-1">IRS Target Schedule</label>
                  <select
                    value={newTripSchedule}
                    onChange={(e) => setNewTripSchedule(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                  >
                    <option value="SCHEDULE_F">Schedule F (Farm Line 10)</option>
                    <option value="SCHEDULE_C">Schedule C (Business Line 9)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-400 font-semibold mb-1">Vehicle Description</label>
                <input
                  type="text"
                  placeholder="e.g., 2024 Ford F-250 Super Duty"
                  value={newTripVehicle}
                  onChange={(e) => setNewTripVehicle(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200 placeholder:text-stone-600"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 flex justify-between items-center text-xs">
                <span className="text-stone-300">Calculated IRS Deduction:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  ${(newTripMiles * IRS_2026_MILEAGE_RATE).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMileageModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold"
                >
                  Save Trip Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Tax Exemption Certificate */}
      {showAddExemptionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-sky-400" />
                <span>Add Tax Exemption Certificate</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddExemptionModal(false)}
                className="text-stone-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExemption} className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-400 font-semibold mb-1">Certificate Title / Issuer</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., State Dept of Revenue Farm Exemption"
                  value={newCertTitle}
                  onChange={(e) => setNewCertTitle(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-400 font-semibold mb-1">Exemption Type</label>
                  <select
                    value={newCertType}
                    onChange={(e) => setNewCertType(e.target.value as any)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                  >
                    <option value="AGRICULTURAL_FARM">Agricultural / Farm Production</option>
                    <option value="WHOLESALE_RESALE">Wholesale / Resale</option>
                    <option value="NON_PROFIT">Non-Profit Entity</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-400 font-semibold mb-1">State / Jurisdiction</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="IA, TX, CA"
                    value={newCertState}
                    onChange={(e) => setNewCertState(e.target.value.toUpperCase())}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-400 font-semibold mb-1">Certificate # / ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., AG-88912-X"
                    value={newCertNumber}
                    onChange={(e) => setNewCertNumber(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-stone-400 font-semibold mb-1">Expiration Date</label>
                  <input
                    type="date"
                    required
                    value={newCertExp}
                    onChange={(e) => setNewCertExp(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-400 font-semibold mb-1">Entity Name Registered</label>
                <input
                  type="text"
                  required
                  value={newCertIssuedTo}
                  onChange={(e) => setNewCertIssuedTo(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                />
              </div>

              <div>
                <label className="block text-stone-400 font-semibold mb-1">Notes / Instructions</label>
                <input
                  type="text"
                  placeholder="e.g., Valid for livestock feed and tractor repair parts"
                  value={newCertNotes}
                  onChange={(e) => setNewCertNotes(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-stone-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExemptionModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold"
                >
                  Save Certificate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
