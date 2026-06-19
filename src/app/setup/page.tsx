'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { 
  Shield, 
  User, 
  Phone, 
  Pill, 
  Key, 
  Save, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Clock, 
  RotateCcw,
  Volume2
} from 'lucide-react';

interface MedicationItem {
  id: string;
  name: string;
}

export default function SetupPage() {
  const router = useRouter();
  
  // Form states
  const [patientName, setPatientName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [medications, setMedications] = useState<MedicationItem[]>([
    { id: '1', name: '아침 혈압약' } // Default item
  ]);
  const [alarmTime, setAlarmTime] = useState('08:00');
  const [pinCode, setPinCode] = useState('');
  
  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'mock'>('connected');

  // Reset/Clear States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPinInput, setResetPinInput] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  // Long press force reset states (for setup page backup bypass)
  const resetTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const [resetProgress, setResetProgress] = useState(0);
  const [resetProgressInterval, setResetProgressInterval] = useState<NodeJS.Timeout | null>(null);

  const playBeepFrequency = (freq: number, duration: number) => {
    if (typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('AudioContext failed');
    }
  };

  const startResetTimer = () => {
    playBeepFrequency(400, 0.05);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      if (progress >= 100) {
        clearInterval(interval);
        executeForceReset();
      } else {
        setResetProgress(progress);
        playBeepFrequency(400 + progress * 3, 0.02);
      }
    }, 300); // 3 seconds total
    setResetProgressInterval(interval);

    resetTimerRef.current = setTimeout(() => {
      executeForceReset();
    }, 3000);
  };

  const cancelResetTimer = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (resetProgressInterval) {
      clearInterval(resetProgressInterval);
      setResetProgressInterval(null);
    }
    setResetProgress(0);
  };

  const executeForceReset = async () => {
    cancelResetTimer();
    playBeepFrequency(1000, 0.5);

    const settingsId = localStorage.getItem('senior_app_settings_id');
    if (settingsId && dbStatus === 'connected') {
      try {
        await supabase.from('settings').delete().eq('id', settingsId);
      } catch (dbErr) {
        console.warn('Failed to delete settings row from remote DB', dbErr);
      }
    }

    localStorage.removeItem('senior_app_settings');
    localStorage.removeItem('senior_app_settings_id');
    localStorage.removeItem('senior_app_logs');
    
    setShowResetModal(false);
    setSuccess(true);
    setError(null);
    setPatientName('');
    setGuardianPhone('');
    setMedications([{ id: '1', name: '' }]);
    setPinCode('');
    
    alert('기기 설정이 강제 초기화되었습니다.');
    window.location.reload();
  };

  useEffect(() => {
    // Check if Supabase envs are available
    const hasDb = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!hasDb) {
      setDbStatus('mock');
    }
    
    // Load existing settings if any
    const localData = localStorage.getItem('senior_app_settings');
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        setPatientName(parsed.patient_name || '');
        setGuardianPhone(parsed.guardian_phone || '');
        setAlarmTime(parsed.alarm_time || '08:00');
        setPinCode(parsed.pin_code || '');
        
        if (parsed.medications && Array.isArray(parsed.medications) && parsed.medications.length > 0) {
          setMedications(parsed.medications);
        } else if (parsed.medication_info) {
          // Backward compatibility: import old single field
          setMedications([{ id: '1', name: parsed.medication_info }]);
        }
      } catch (e) {
        console.error('Failed to parse local settings', e);
      }
    }
  }, []);

  // Medication list handlers
  const handleAddMedication = () => {
    setMedications([
      ...medications,
      { id: Date.now().toString(), name: '' }
    ]);
  };

  const handleMedicationChange = (id: string, val: string) => {
    setMedications(
      medications.map(item => item.id === id ? { ...item, name: val } : item)
    );
  };

  const handleRemoveMedication = (id: string) => {
    if (medications.length <= 1) {
      setError('어르신이 드시는 약이나 영양제를 최소 한 개 이상 입력해 주세요.');
      return;
    }
    setMedications(medications.filter(item => item.id !== id));
  };

  // Save Settings Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!patientName.trim()) {
      setError('어르신 성함을 입력해 주세요.');
      setLoading(false);
      return;
    }
    if (!guardianPhone.trim()) {
      setError('보호자 전화번호를 입력해 주세요.');
      setLoading(false);
      return;
    }
    
    const validMeds = medications.filter(m => m.name.trim() !== '');
    if (validMeds.length === 0) {
      setError('약물/영양제 이름을 최소 1개 기입해 주세요.');
      setLoading(false);
      return;
    }

    if (!alarmTime) {
      setError('매일 알람을 울릴 복용 시간을 지정해 주세요.');
      setLoading(false);
      return;
    }

    if (pinCode.length !== 4 || isNaN(Number(pinCode))) {
      setError('비밀번호는 숫자 4자리로 설정해 주세요.');
      setLoading(false);
      return;
    }

    // Attempt to request Notification permission for daily alert
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (e) {
        console.warn('Notification permission prompt failed', e);
      }
    }

    const payload = {
      patient_name: patientName.trim(),
      guardian_phone: guardianPhone.trim(),
      medications: validMeds, // Array stored as JSONB
      alarm_time: alarmTime,
      pin_code: pinCode,
    };

    try {
      // 1. Save to LocalStorage
      localStorage.setItem('senior_app_settings', JSON.stringify(payload));
      
      // 2. Save to Supabase DB if config is present
      if (dbStatus === 'connected') {
        const { data: existing, error: fetchErr } = await supabase
          .from('settings')
          .select('id')
          .limit(1);

        if (fetchErr) throw fetchErr;

        // Legacy compatibility object
        const legacyPayload = {
          patient_name: payload.patient_name,
          guardian_phone: payload.guardian_phone,
          medication_info: validMeds.map(m => m.name).join(', '), // backup text
          medications: payload.medications,
          alarm_time: payload.alarm_time,
          pin_code: payload.pin_code,
        };

        if (existing && existing.length > 0) {
          // Update
          const { error: updateErr } = await supabase
            .from('settings')
            .update(legacyPayload)
            .eq('id', existing[0].id);
          
          if (updateErr) throw updateErr;
          localStorage.setItem('senior_app_settings_id', existing[0].id);
        } else {
          // Insert
          const { data: inserted, error: insertErr } = await supabase
            .from('settings')
            .insert([legacyPayload])
            .select();
          
          if (insertErr) throw insertErr;
          if (inserted && inserted[0]) {
            localStorage.setItem('senior_app_settings_id', inserted[0].id);
          }
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 1500);

    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(`서버 저장에 실패했습니다 (${err.message || '네트워크 오류'}). 기기에 설정을 임시 저장하고 완료합니다.`);
      setDbStatus('mock');
      setLoading(false);
    }
  };

  // Factory reset execution
  const handleFactoryReset = async () => {
    setResetError(null);
    const storedSettings = localStorage.getItem('senior_app_settings');
    if (!storedSettings) {
      // Clear anyway
      localStorage.clear();
      window.location.reload();
      return;
    }

    try {
      const parsed = JSON.parse(storedSettings);
      if (resetPinInput !== parsed.pin_code) {
        setResetError('비밀번호가 일치하지 않습니다.');
        return;
      }

      // Try deleting DB rows first if available
      const settingsId = localStorage.getItem('senior_app_settings_id');
      if (settingsId && dbStatus === 'connected') {
        try {
          await supabase.from('settings').delete().eq('id', settingsId);
        } catch (dbErr) {
          console.warn('Failed to delete settings row from remote DB', dbErr);
        }
      }

      // Wipe everything
      localStorage.removeItem('senior_app_settings');
      localStorage.removeItem('senior_app_settings_id');
      localStorage.removeItem('senior_app_logs');
      
      setShowResetModal(false);
      setSuccess(true);
      setError(null);
      setPatientName('');
      setGuardianPhone('');
      setMedications([{ id: '1', name: '' }]);
      setPinCode('');
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (e: any) {
      setResetError('초기화 도중 오류가 발생했습니다: ' + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-slate-900 text-white p-8 text-center relative">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            {dbStatus === 'connected' ? 'DB 연동됨' : '임시 로컬 모드'}
          </div>
          <Shield className="w-12 h-12 text-blue-400 mx-auto mb-3" />
          <h1 className="text-2xl font-bold tracking-tight">시니어 건강알리미</h1>
          <p className="text-slate-400 text-sm mt-1">보호자용 기기 설정 화면</p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-3 text-sm font-semibold">
              <Save className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>설정이 저장되었습니다! 메인 화면으로 이동합니다.</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> 어르신 성함
              </label>
              <input
                id="input-setup-name"
                type="text"
                placeholder="예: 홍길순"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-lg"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                disabled={loading || success}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5 flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-400" /> 보호자 전화번호
              </label>
              <input
                id="input-setup-phone"
                type="tel"
                placeholder="예: 010-1234-5678"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-lg"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                disabled={loading || success}
              />
              <p className="text-xs text-slate-400 mt-1">이상 징후 발생 시 이 번호로 SMS 문자가 자동 발송됩니다.</p>
            </div>

            {/* Dynamic Medications List */}
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-slate-400" /> 복용약 및 영양제 목록
                </span>
                <button
                  type="button"
                  onClick={handleAddMedication}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer text-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" /> 추가
                </button>
              </label>

              <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                {medications.map((med, index) => (
                  <div key={med.id} className="flex gap-2 items-center">
                    <input
                      id={`input-setup-med-${index}`}
                      type="text"
                      placeholder="예: 혈압약, 비타민, 당뇨약 등"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-md"
                      value={med.name}
                      onChange={(e) => handleMedicationChange(med.id, e.target.value)}
                      disabled={loading || success}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveMedication(med.id)}
                      className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl cursor-pointer"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Alarm Time Settings */}
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> 매일 알람 시간 설정
              </label>
              <input
                id="input-setup-alarm"
                type="time"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-normal text-lg"
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
                disabled={loading || success}
              />
              <p className="text-xs text-slate-400 mt-1">이 시간이 되면 기기에서 비프음과 함께 약 드시라는 안내 음성이 반복됩니다.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5 flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-400" /> PIN 비밀번호 (4자리)
              </label>
              <input
                id="input-setup-pin"
                type="text"
                maxLength={4}
                pattern="\d{4}"
                placeholder="숫자 4자리"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-lg"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                disabled={loading || success}
              />
              <p className="text-xs text-slate-400 mt-1">어르신이 매일 화면을 켜고 입력할 4자리 암호입니다.</p>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="btn-setup-submit"
            type="submit"
            disabled={loading || success}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>설정 저장하고 앱 시작하기</span>
              </>
            )}
          </button>

          {/* Separation line */}
          <div className="border-t border-slate-200 my-6" />

          {/* Reset Action */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setResetError(null);
                setResetPinInput('');
                setShowResetModal(true);
              }}
              className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold border border-red-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>모든 기록 및 설정 초기화</span>
            </button>
          </div>
        </form>
      </div>

      {/* Safety Reset PIN Validation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100]">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 border border-slate-200 text-center">
            <RotateCcw className="w-14 h-14 text-red-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-900">모든 설정을 초기화할까요?</h2>
            <p className="text-sm text-slate-500 mt-2">
              어르신 이름, 약물 목록, 기기 비밀번호 등 모든 로컬 기록이 영구히 삭제됩니다. 계속하려면 설정된 **비밀번호 4자리**를 입력해 주세요.
            </p>

            {resetError && (
              <p className="text-sm text-red-600 font-semibold mt-3">{resetError}</p>
            )}

            <input
              type="text"
              maxLength={4}
              placeholder="비밀번호 4자리"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl font-mono tracking-widest text-center text-xl mt-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              value={resetPinInput}
              onChange={(e) => setResetPinInput(e.target.value.replace(/\D/g, ''))}
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleFactoryReset}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl cursor-pointer shadow-md"
              >
                초기화
              </button>
            </div>

            {/* PIN bypass forced reset longpress */}
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <button
                type="button"
                onMouseDown={startResetTimer}
                onMouseUp={cancelResetTimer}
                onMouseLeave={cancelResetTimer}
                onTouchStart={startResetTimer}
                onTouchEnd={cancelResetTimer}
                className="py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold border border-red-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-all select-none"
              >
                {resetProgress > 0 ? `강제초기화 진행 중 (${resetProgress}%)` : '비밀번호 분실 시 3초 꾹 누르기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
