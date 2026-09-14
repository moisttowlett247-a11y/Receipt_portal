import React, { useState, useEffect } from 'react';
import { Lock, User, KeyRound, X, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { computeCredentialsHash } from '../hashUtils';

interface AdminCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  savedHash: string | null;
  savedUsername: string | null;
  onUpdateCredentials: (username: string, passwordHash: string) => void;
}

export const AdminPinModal: React.FC<AdminCredentialsModalProps> = ({
  isOpen,
  onClose,
  savedHash,
  savedUsername,
  onUpdateCredentials
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState(savedUsername || 'admin');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewUsername(savedUsername || 'admin');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
    }
  }, [isOpen, savedUsername]);

  if (!isOpen) return null;

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUser = (savedUsername || 'admin').trim().toLowerCase();
    const cleanCurrentPass = currentPassword.trim();
    const cleanNewUser = newUsername.trim().toLowerCase();
    const cleanNewPass = newPassword.trim();

    if (!cleanCurrentPass) {
      triggerError('Please enter your current password.');
      return;
    }
    if (!cleanNewUser) {
      triggerError('Please enter a valid username.');
      return;
    }
    if (cleanNewPass.length < 6) {
      triggerError('New password must be at least 6 characters.');
      return;
    }
    if (cleanNewPass !== confirmPassword.trim()) {
      triggerError('New passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // Verify current credentials
      const currentHash = await computeCredentialsHash(cleanUser, cleanCurrentPass);
      const defaultHash = await computeCredentialsHash('admin', '1995');

      if ((savedHash && currentHash === savedHash) || currentHash === defaultHash) {
        // Compute new hash
        const newHash = await computeCredentialsHash(cleanNewUser, cleanNewPass);
        onUpdateCredentials(cleanNewUser, newHash);
        onClose();
      } else {
        triggerError('Current password is incorrect.');
      }
    } catch {
      triggerError('Error updating credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div 
        className={`bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 transition-transform ${
          shake ? 'animate-bounce border-rose-500/80' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-100">
                Change Admin Credentials
              </h3>
              <p className="text-xs text-stone-400">
                Update master login username & password
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-lg flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="text-stone-300 font-medium block mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>

          <div className="h-px bg-stone-800 my-2" />

          <div>
            <label className="text-stone-300 font-medium block mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-stone-400" />
              New Admin Username
            </label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. admin or custom name"
              className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-stone-300 font-medium block mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
                New Password (min 6 chars)
              </span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-stone-500 hover:text-stone-300 flex items-center gap-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-stone-300 font-medium block mb-1">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full font-mono px-3 py-2 bg-stone-950 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-2 flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Saving...' : 'Save Credentials'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
