'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSpeech } from '@/hooks/useSpeech';
import { supabase } from '@/lib/supabaseClient';
import { 
  CheckCircle2, 
  Camera, 
  AlertTriangle, 
  Check, 
  Smartphone, 
  Keyboard, 
  CornerDownLeft, 
  RefreshCw, 
  Volume2, 
  VolumeX,
  Clock,
  RotateCcw,
  BellRing
} from 'lucide-react';

// Step Enum
type Step = 'LOCK' | 'MEDICATION' | 'MEASURE_GUIDE' | 'CAMERA_OCR' | 'MANUAL_INPUT' | 'CONFIRM' | 'COMPLETE';

interface MedicationItem {
  id: string;
  name: string;
}

export default function KioskPage() {
  const router = useRouter();
  const { speak, stop, speaking, isSupported } = useSpeech();

  // App Settings State (Loaded from LocalStorage/DB)
  const [settings, setSettings] = useState<{
    id?: string;
    patient_name: string;
    guardian_phone: string;
    medications: MedicationItem[];
    alarm_time: string;
    pin_code: string;
  } | null>(null);

  // Kiosk Flow States
  const [currentStep, setCurrentStep] = useState<Step>('LOCK');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  
  // Multiple Medications state
  const [activeMedIndex, setActiveMedIndex] = useState(0);
  const [medicationsStatus, setMedicationsStatus] = useState<Record<string, boolean>>({});
  
  // Blood pressure readings
  const [systolic, setSystolic] = useState<number | null>(null);
  const [diastolic, setDiastolic] = useState<number | null>(null);
  
  // Custom manual numeric inputs
  const [manualSys, setManualSys] = useState('');
  const [manualDia, setManualDia] = useState('');
  const [manualFocus, setManualFocus] = useState<'sys' | 'dia'>('sys');

  // OCR Camera States
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Alarm Alerts States (Daily medication reminder)
  const [alarmActive, setAlarmActive] = useState(false);
  const [alarmBeepingInterval, setAlarmBeepingInterval] = useState<NodeJS.Timeout | null>(null);
  const [hasCompletedToday, setHasCompletedToday] = useState(false);

  // Notification / Alert overlays
  const [medicationWarning, setMedicationWarning] = useState<string | null>(null);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);
  const [generalAlert, setGeneralAlert] = useState<string | null>(null);

  // Sound effects & speech initialization
  const [ttsMuted, setTtsMuted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Long press force reset states
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [resetProgress, setResetProgress] = useState(0); // 0 to 100
  const [resetProgressInterval, setResetProgressInterval] = useState<NodeJS.Timeout | null>(null);

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
    }, 300); // 3000ms total
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
    if (settingsId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      try {
        await supabase.from('settings').delete().eq('id', settingsId);
      } catch (e) {
        console.warn('DB settings delete failed on force reset', e);
      }
    }

    localStorage.removeItem('senior_app_settings');
    localStorage.removeItem('senior_app_settings_id');
    localStorage.removeItem('senior_app_logs');
    
    speak('기기 설정을 강제로 초기화했습니다. 다시 설정해 주세요.');
    alert('기기 설정이 강제 초기화되었습니다. 보호자 설정 화면으로 이동합니다.');
    router.push('/setup');
  };

  // Load Settings & Redirect if empty
  useEffect(() => {
    const localData = localStorage.getItem('senior_app_settings');
    if (!localData) {
      router.push('/setup');
    } else {
      try {
        const parsed = JSON.parse(localData);
        
        // Migrate legacy schemas: ensure medications array exists
        if (!parsed.medications || !Array.isArray(parsed.medications)) {
          parsed.medications = [
            { id: '1', name: parsed.medication_info || '아침 혈압약' }
          ];
        }
        if (!parsed.alarm_time) {
          parsed.alarm_time = '08:00';
        }

        setSettings(parsed);
        
        // Reset completion status checking if there is a record today
        checkIfAlreadyRecordedToday();
      } catch (e) {
        router.push('/setup');
      }
    }
  }, [router]);

  // Check local or remote records to see if user already submitted logs today
  const checkIfAlreadyRecordedToday = () => {
    const todayStr = new Date().toLocaleDateString('ko-KR');
    const localLogs = JSON.parse(localStorage.getItem('senior_app_logs') || '[]');
    const hasLogToday = localLogs.some((log: any) => {
      if (!log.created_at) return false;
      return new Date(log.created_at).toLocaleDateString('ko-KR') === todayStr;
    });

    if (hasLogToday) {
      setHasCompletedToday(true);
    }
  };

  // Handle TTS automatic voice guidance on step change or medication index change
  useEffect(() => {
    if (ttsMuted || !settings) return;

    let text = '';
    switch (currentStep) {
      case 'LOCK':
        if (!alarmActive) {
          text = '비밀번호 네 자리를 눌러주세요.';
        }
        break;
      case 'MEDICATION':
        const currentMed = settings?.medications?.[activeMedIndex];
        if (currentMed) {
          text = `오늘 아침 ${currentMed.name}을 드셨나요? 아래 버튼을 눌러주세요.`;
        }
        break;
      case 'MEASURE_GUIDE':
        text = '혈압계로 혈압을 재볼까요? 아래 큰 버튼을 누르고 카메라로 혈압계를 찍어주세요.';
        break;
      case 'CAMERA_OCR':
        text = '혈압계 화면을 네모 칸 안에 맞춰주세요. 화면이 잘 보일 때 찍기 버튼을 눌러주세요.';
        break;
      case 'MANUAL_INPUT':
        text = '혈압 수치를 직접 입력해 주세요. 위쪽 칸은 수축기, 아래쪽 칸은 이완기 혈압입니다.';
        break;
      case 'CONFIRM':
        if (systolic && diastolic) {
          const classification = getBloodPressureStatus(systolic, diastolic);
          let interpretation = '';
          if (classification === '정상') {
            interpretation = '혈압이 정상이에요. 오늘도 건강한 하루 보내세요!';
          } else if (classification === '경계') {
            interpretation = '혈압이 조금 높아요. 물 한 컵 마시고 잠시 쉬세요.';
          } else {
            interpretation = '혈압이 많이 높아요! 지금 바로 보호자에게 문자 메시지로 알릴게요.';
          }
          text = `수축기 ${systolic}, 이완기 ${diastolic}입니다. ${interpretation} 확인하셨으면 아래 확인했어요 버튼을 눌러주세요.`;
        }
        break;
      case 'COMPLETE':
        text = '오늘 건강 기록이 완료되었습니다. 잘 하셨어요! 오늘도 건강하세요.';
        break;
    }

    if (text && hasInteracted && !alarmActive) {
      speak(text);
    }
  }, [currentStep, settings, ttsMuted, activeMedIndex, systolic, diastolic, hasInteracted, alarmActive, speak]);

  // Daily Alarm Scheduler Interval Check (Runs every 30 seconds)
  useEffect(() => {
    if (!settings || !settings.alarm_time) return;

    const interval = setInterval(() => {
      // If already finished recording today, bypass alarm checking
      if (hasCompletedToday || alarmActive) return;

      const now = new Date();
      const currentHours = now.getHours().toString().padStart(2, '0');
      const currentMinutes = now.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;

      if (currentTimeStr === settings.alarm_time) {
        triggerDailyAlarm();
      }
    }, 30000); // 30 seconds check

    return () => clearInterval(interval);
  }, [settings, hasCompletedToday, alarmActive]);

  // Clean alarm interval on unmount
  useEffect(() => {
    return () => {
      if (alarmBeepingInterval) clearInterval(alarmBeepingInterval);
    };
  }, [alarmBeepingInterval]);

  // Trigger Scheduled alarm alert
  const triggerDailyAlarm = () => {
    setAlarmActive(true);
    setCurrentStep('LOCK'); // Bring to lock screen to enforce login

    // Start beep intervals
    const beepTimer = setInterval(() => {
      playBeepFrequency(800, 0.25);
    }, 1200);
    setAlarmBeepingInterval(beepTimer);

    // Speak alarm notification
    if (!ttsMuted) {
      speak('어르신, 건강 약을 드시고 혈압을 측정할 시간입니다! 비밀번호를 누르고 기록을 남겨주세요.');
    }

    // Trigger Native HTML5 notification if allowed
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('건강 알림 시간입니다!', {
        body: '약 드실 시간 및 혈압 측정 시간입니다. 앱을 확인해 주세요.',
        icon: '/next.svg',
        requireInteraction: true,
      });
    }
  };

  // Turn off alarm
  const dismissAlarm = () => {
    setAlarmActive(false);
    if (alarmBeepingInterval) {
      clearInterval(alarmBeepingInterval);
      setAlarmBeepingInterval(null);
    }
    stop();
    playBeep();
    speak('알람을 껐습니다. 비밀번호 네 자리를 눌러 시작해 주세요.');
  };

  // Audio initialization (Unlock autoplay context)
  const handleFirstInteraction = () => {
    if (!hasInteracted) {
      setHasInteracted(true);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
      }
      if (!alarmActive) {
        speak('안녕하세요. 비밀번호 네 자리를 눌러주세요.');
      }
    }
  };

  // Play custom audio beep frequency
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

  // Play standard UI button click sound (beep)
  const playBeep = () => {
    playBeepFrequency(600, 0.08);
  };

  // Blood Pressure Classification Logic
  const getBloodPressureStatus = (sys: number, dia: number): '정상' | '경계' | '위험' => {
    if (sys >= 180 || dia >= 110) return '위험';
    if (sys >= 130 || dia >= 85) return '경계';
    return '정상';
  };

  // Pin Keypad Handler
  const handlePinPress = (num: string) => {
    playBeep();
    handleFirstInteraction();
    
    // In case alarm is ringing, dismiss on first keypad press
    if (alarmActive) {
      dismissAlarm();
      return;
    }

    if (pinInput.length >= 4) return;
    
    const newVal = pinInput + num;
    setPinInput(newVal);

    if (newVal.length === 4) {
      if (settings && newVal === settings.pin_code) {
        setPinError(false);
        setTimeout(() => {
          setCurrentStep('MEDICATION');
          setActiveMedIndex(0);
          setMedicationsStatus({});
          setPinInput('');
        }, 300);
      } else {
        setPinError(true);
        speak('비밀번호가 틀렸습니다. 다시 눌러주세요.');
        setTimeout(() => {
          setPinInput('');
          setPinError(false);
        }, 1000);
      }
    }
  };

  const handlePinDelete = () => {
    playBeep();
    handleFirstInteraction();
    setPinInput(pinInput.slice(0, -1));
  };

  // Medication Answer Handler (Handles sequential checklist)
  const handleMedicationAnswer = (taken: boolean) => {
    playBeep();
    if (!settings) return;

    const currentMed = settings?.medications?.[activeMedIndex];
    if (!currentMed) return;

    // Save current medication status
    const updatedStatus = { ...medicationsStatus, [currentMed.name]: taken };
    setMedicationsStatus(updatedStatus);

    if (!taken) {
      // Enforce pill compliance alert
      setMedicationWarning(currentMed.name);
      speak(`지금 ${currentMed.name}을 꼭 드세요! 드신 후에 다시 기록 버튼을 눌러주세요.`);
    } else {
      advanceMedicationFlow(updatedStatus);
    }
  };

  const advanceMedicationFlow = (statusMap: Record<string, boolean>) => {
    if (!settings) return;
    
    // If there is another medication, go to the next index
    const medsLength = settings?.medications?.length || 1;
    if (activeMedIndex < medsLength - 1) {
      setActiveMedIndex(activeMedIndex + 1);
    } else {
      // Completed checking all medications
      setCurrentStep('MEASURE_GUIDE');
    }
  };

  // Camera activation
  const startCamera = async () => {
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Camera error, retrying standard camera:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: false 
        });
        setCameraStream(fallbackStream);
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
        }
      } catch (fallbackErr) {
        setCameraError('카메라를 켤 수 없습니다. 숫자로 입력해 주세요.');
        speak('카메라를 켤 수 없습니다. 숫자로 입력하기 버튼을 눌러주세요.');
      }
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const triggerCameraStep = () => {
    playBeep();
    setCurrentStep('CAMERA_OCR');
    setTimeout(() => {
      startCamera();
    }, 100);
  };

  const triggerManualInputStep = () => {
    playBeep();
    setCurrentStep('MANUAL_INPUT');
    setManualSys('');
    setManualDia('');
    setManualFocus('sys');
  };

  // Capture frame and call OCR API
  const captureAndOcr = async () => {
    playBeep();
    if (!videoRef.current || ocrLoading) return;

    setOcrLoading(true);
    speak('혈압계 글자를 읽고 있습니다. 잠시만 기다려 주세요.');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.85);
        stopCamera();

        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setSystolic(data.systolic);
          setDiastolic(data.diastolic);
          setCurrentStep('CONFIRM');
        } else {
          const errMsg = data.error || '잘 안 보여요. 더 가까이 대주세요.';
          setGeneralAlert(errMsg);
          speak(errMsg);
          setTimeout(() => {
            setGeneralAlert(null);
            startCamera();
          }, 4000);
        }
      }
    } catch (e) {
      console.error('OCR process exception:', e);
      setGeneralAlert('인식 오류가 발생했습니다. 다시 촬영합니다.');
      speak('인식 오류가 발생했습니다. 다시 촬영합니다.');
      setTimeout(() => {
        setGeneralAlert(null);
        startCamera();
      }, 3000);
    } finally {
      setOcrLoading(false);
    }
  };

  // Manual Input Keypad Handler
  const handleManualKeypress = (num: string) => {
    playBeep();
    if (manualFocus === 'sys') {
      if (manualSys.length >= 3) return;
      setManualSys(manualSys + num);
    } else {
      if (manualDia.length >= 3) return;
      setManualDia(manualDia + num);
    }
  };

  const handleManualBackspace = () => {
    playBeep();
    if (manualFocus === 'sys') {
      setManualSys(manualSys.slice(0, -1));
    } else {
      setManualDia(manualDia.slice(0, -1));
    }
  };

  const handleManualSubmit = () => {
    playBeep();
    const sysNum = parseInt(manualSys, 10);
    const diaNum = parseInt(manualDia, 10);

    if (isNaN(sysNum) || sysNum < 50 || sysNum > 250) {
      speak('수축기 혈압 수치가 바르지 않습니다. 다시 입력해 주세요.');
      setManualFocus('sys');
      return;
    }
    if (isNaN(diaNum) || diaNum < 30 || diaNum > 180) {
      speak('이완기 혈압 수치가 바르지 않습니다. 다시 입력해 주세요.');
      setManualFocus('dia');
      return;
    }

    setSystolic(sysNum);
    setDiastolic(diaNum);
    setCurrentStep('CONFIRM');
  };

  // Check database/localStorage logs for consecutive 2 days medication miss on ANY drug
  const checkConsecutiveMiss = async (patientId: string): Promise<string[]> => {
    const missedMedsToday = Object.entries(medicationsStatus)
      .filter(([_, taken]) => !taken)
      .map(([name]) => name);

    if (missedMedsToday.length === 0) return [];

    try {
      if (!patientId || process.env.NEXT_PUBLIC_MOCK_MODE === 'true') {
        // Mock check logic: 40% chance of returning missed meds to trigger alert
        return Math.random() < 0.4 ? missedMedsToday : [];
      }
      
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Query database for records in past 48 hours
      const { data, error } = await supabase
        .from('health_records')
        .select('medications_status, created_at')
        .eq('patient_id', patientId)
        .gte('created_at', twoDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        // Find yesterday's record
        const yesterdayRecord = data[0]; // ordered descending, so index 0 is most recent past log
        const pastStatus = yesterdayRecord.medications_status || {};
        
        // Find meds that were missed yesterday AND missed today
        const doubleMissed = missedMedsToday.filter(medName => pastStatus[medName] === false);
        return doubleMissed;
      }
      return [];
    } catch (e) {
      console.warn('DB check for consecutive miss failed, trying local logs', e);
      // Fallback local check
      const localLogs = JSON.parse(localStorage.getItem('senior_app_logs') || '[]');
      if (localLogs.length > 0) {
        const lastLog = localLogs[localLogs.length - 1];
        const pastStatus = lastLog.medications_status || {};
        return missedMedsToday.filter(medName => pastStatus[medName] === false);
      }
      return [];
    }
  };

  // Submit Health records (DB save & Twilio trigger)
  const handleConfirmValues = async () => {
    playBeep();
    if (!settings || systolic === null || diastolic === null) return;

    setOcrLoading(true);
    setSmsStatus(null);

    const classification = getBloodPressureStatus(systolic, diastolic);
    const isCrisis = classification === '위험';
    const patientId = localStorage.getItem('senior_app_settings_id') || '';

    // Calculate consecutive medication miss
    const doubleMissedMeds = await checkConsecutiveMiss(patientId);
    const isDoubleMiss = doubleMissedMeds.length > 0;

    // Check if overall all medications were taken
    const overallMedTaken = Object.values(medicationsStatus).every(v => v === true);

    // Prepare SMS body
    const timeString = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const dateString = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    let smsMessage = '';
    
    if (isCrisis) {
      smsMessage = `[경고] 어머니(${settings.patient_name})께서 오늘 ${dateString} ${timeString} 혈압을 측정하셨어요. 수축기 ${systolic} / 이완기 ${diastolic}로 혈압이 매우 높은 상태(위험)입니다. 확인을 권장합니다. - 건강알리미`;
    } else if (isDoubleMiss) {
      smsMessage = `[알림] 어머니(${settings.patient_name})께서 2일 연속으로 약(${doubleMissedMeds.join(', ')})을 복용하지 않으셨습니다. 전화 확인을 권장합니다. - 건강알리미`;
    }

    let smsSent = false;

    // Send SMS via route
    if (isCrisis || isDoubleMiss) {
      try {
        setSmsStatus('전송중');
        const smsRes = await fetch('/api/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientName: settings.patient_name,
            guardianPhone: settings.guardian_phone,
            message: smsMessage
          })
        });

        if (smsRes.ok) {
          smsSent = true;
          setSmsStatus('전송완료');
          speak('보호자 분께 이상 알림 문자를 보냈어요.');
          setTimeout(() => {
            setSmsStatus(null);
          }, 3000);
        } else {
          setSmsStatus('전송실패');
        }
      } catch (err) {
        console.error('Error sending auto SMS:', err);
        setSmsStatus('전송실패');
      }
    }

    // Save record to DB
    try {
      const dbPayload = {
        patient_id: patientId || null,
        medication_taken: overallMedTaken,
        medications_status: medicationsStatus, // Store full dictionary detail
        systolic,
        diastolic,
        status: classification,
        sms_sent: smsSent,
      };

      if (patientId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        const { error: dbErr } = await supabase.from('health_records').insert([dbPayload]);
        if (dbErr) throw dbErr;
      } else {
        const localLogs = JSON.parse(localStorage.getItem('senior_app_logs') || '[]');
        localLogs.push({ ...dbPayload, created_at: new Date().toISOString() });
        localStorage.setItem('senior_app_logs', JSON.stringify(localLogs));
      }
    } catch (dbErr) {
      console.warn('DB recording failed, saving locally:', dbErr);
      const localLogs = JSON.parse(localStorage.getItem('senior_app_logs') || '[]');
      localLogs.push({
        medication_taken: overallMedTaken,
        medications_status: medicationsStatus,
        systolic,
        diastolic,
        status: classification,
        sms_sent: smsSent,
        created_at: new Date().toISOString()
      });
      localStorage.setItem('senior_app_logs', JSON.stringify(localLogs));
    }

    setOcrLoading(false);
    setHasCompletedToday(true);
    setCurrentStep('COMPLETE');
  };

  // Manual Trigger for Optional SMS in STEP_5
  const sendManualSms = async () => {
    playBeep();
    if (!settings || systolic === null || diastolic === null) return;

    setSmsStatus('전송중');
    const timeString = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const dateString = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    const classification = getBloodPressureStatus(systolic, diastolic);
    
    // Format med taken list text
    const medSummary = Object.entries(medicationsStatus)
      .map(([name, taken]) => `${name}: ${taken ? '복용' : '미복용'}`)
      .join(', ');

    const message = `[알리미] 어머니(${settings.patient_name})의 오늘(${dateString} ${timeString}) 건강 기록입니다. 혈압: ${systolic}/${diastolic} (${classification}), 복약 정보: [${medSummary}]. - 건강알리미`;

    try {
      const smsRes = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: settings.patient_name,
          guardianPhone: settings.guardian_phone,
          message
        })
      });

      if (smsRes.ok) {
        setSmsStatus('보호자께 문자를 보냈어요');
        speak('보호자분께 건강 기록 문자를 보냈습니다.');
      } else {
        setSmsStatus('문자 보내기 실패');
        speak('보호자 문자를 보내지 못했습니다.');
      }
    } catch (e) {
      setSmsStatus('문자 보내기 실패');
      speak('보호자 문자를 보내지 못했습니다.');
    }

    setTimeout(() => {
      setSmsStatus(null);
    }, 4000);
  };

  const handleFinish = () => {
    playBeep();
    setCurrentStep('LOCK');
    setPinInput('');
    setSystolic(null);
    setDiastolic(null);
  };

  return (
    <main className="kiosk-container select-none relative">
      
      {/* Alarm Warning Overlay (Rings on configured time) */}
      {alarmActive && (
        <div className="absolute inset-0 bg-red-600 flex flex-col items-center justify-between p-8 z-[200]">
          <div className="text-center my-auto space-y-8 animate-pulse-slow">
            <BellRing className="w-40 h-40 text-white mx-auto animate-bounce" />
            <h1 className="text-5xl font-extrabold text-white leading-normal">
              약 드실 시간입니다!
            </h1>
            <p className="text-3xl text-red-100 font-bold leading-relaxed">
              설정하신 알람 시간({settings?.alarm_time})이 되었습니다.<br />
              약을 챙겨 드시고 혈압을 기록해 주세요.
            </p>
          </div>
          
          <button
            id="btn-alarm-dismiss"
            onClick={dismissAlarm}
            className="w-full py-12 bg-white text-red-700 text-4xl font-extrabold rounded-3xl shadow-2xl cursor-pointer active:scale-95 transition-transform"
          >
            알람 끄기
          </button>
        </div>
      )}

      {/* Volume Control Button Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <button 
          id="btn-volume-toggle"
          onClick={() => {
            playBeep();
            if (!ttsMuted) stop();
            setTtsMuted(!ttsMuted);
          }}
          className="p-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full border border-slate-300 shadow-md cursor-pointer flex items-center justify-center"
          title={ttsMuted ? "음성 켜기" : "음성 끄기"}
        >
          {ttsMuted ? <VolumeX className="w-8 h-8 text-red-600" /> : <Volume2 className="w-8 h-8 text-blue-600 animate-pulse" />}
        </button>
      </div>

      {/* 1. LOCK STEP */}
      {currentStep === 'LOCK' && (
        <div className="flex flex-col flex-1 items-center justify-between py-6 relative">
          
          {/* Safe Long-press Force Reset (Top Left) */}
          <div className="absolute top-0 left-0 z-40 select-none">
            <button
              id="btn-force-reset-longpress"
              onMouseDown={startResetTimer}
              onMouseUp={cancelResetTimer}
              onMouseLeave={cancelResetTimer}
              onTouchStart={startResetTimer}
              onTouchEnd={cancelResetTimer}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-500 rounded-xl text-md font-bold active:bg-red-600 active:text-white cursor-pointer select-none transition-all"
            >
              {resetProgress > 0 ? `초기화 중 (${resetProgress}%)` : '3초간 꾹 누르면 초기화'}
            </button>
          </div>

          <div className="text-center mt-6">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-normal">
              안녕하세요 😊
            </h1>
            <p className="text-3xl text-slate-600 mt-4 leading-normal font-bold">
              비밀번호 네 자리를 눌러주세요.
            </p>
            {/* Password Dot Indicators */}
            <div className="flex justify-center gap-6 mt-8">
              {[0, 1, 2, 3].map((idx) => (
                <div 
                  key={idx} 
                  className={`w-8 h-8 rounded-full border-4 ${
                    pinError 
                      ? 'bg-red-600 border-red-700 animate-shake' 
                      : pinInput.length > idx 
                        ? 'bg-blue-600 border-blue-700' 
                        : 'bg-white border-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Keypad Grid (Buttons 80px x 80px or higher) */}
          <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                id={`btn-pin-${num}`}
                onClick={() => handlePinPress(num)}
                className="h-24 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-300 text-4xl font-bold rounded-2xl flex items-center justify-center text-slate-900 shadow-sm transition-colors cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              id="btn-goto-setup"
              onClick={() => { playBeep(); router.push('/setup'); }}
              className="h-24 bg-slate-200 hover:bg-slate-300 text-xl font-bold rounded-2xl flex items-center justify-center text-slate-700 shadow-sm border border-slate-300 cursor-pointer"
            >
              설정변경
            </button>
            <button
              id="btn-pin-0"
              onClick={() => handlePinPress('0')}
              className="h-24 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-4xl font-bold rounded-2xl flex items-center justify-center text-slate-900 shadow-sm cursor-pointer"
            >
              0
            </button>
            <button
              id="btn-pin-delete"
              onClick={handlePinDelete}
              className="h-24 bg-red-100 hover:bg-red-200 active:bg-red-300 text-2xl font-bold text-red-700 border border-red-200 rounded-2xl flex items-center justify-center shadow-sm cursor-pointer"
            >
              지우기
            </button>
          </div>
        </div>
      )}

      {/* 2. MEDICATION STEP */}
      {currentStep === 'MEDICATION' && settings?.medications?.[activeMedIndex] && (
        <div className="flex flex-col flex-1 items-center justify-between">
          <div className="text-center mt-12 px-6">
            <h1 className="text-3xl font-extrabold text-slate-500 leading-normal">
              약 복용 확인 ({activeMedIndex + 1} / {settings?.medications?.length || 1})
            </h1>
            <p className="text-4xl text-slate-800 mt-6 font-bold leading-relaxed">
              오늘 아침 <span className="text-blue-700 border-b-4 border-blue-500 pb-1">{settings?.medications?.[activeMedIndex]?.name}</span>을 드셨나요?
            </p>
          </div>

          {/* Two Buttons taking up significant space */}
          <div className="flex flex-col gap-6 w-full px-4 mb-8">
            <button
              id="btn-med-yes"
              onClick={() => handleMedicationAnswer(true)}
              className="w-full py-12 bg-[#057a55] hover:bg-emerald-800 text-white text-4xl font-extrabold rounded-3xl shadow-lg flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Check className="w-12 h-12 stroke-[4px]" />
              <span>네, 먹었어요</span>
            </button>
            
            <button
              id="btn-med-no"
              onClick={() => handleMedicationAnswer(false)}
              className="w-full py-12 bg-[#e02424] hover:bg-red-800 text-white text-4xl font-extrabold rounded-3xl shadow-lg flex items-center justify-center gap-3 cursor-pointer transition-all active:scale-[0.98]"
            >
              <span>아직 못 먹었어요</span>
            </button>
          </div>

          {/* Alert Modal for medication warning */}
          {medicationWarning && (
            <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-between p-8 z-50">
              <div className="text-center my-auto space-y-6">
                <AlertTriangle className="w-28 h-28 text-red-600 mx-auto animate-bounce" />
                <h2 className="text-4xl font-extrabold text-red-600 leading-relaxed">
                  {medicationWarning}을 꼭 드세요!
                </h2>
                <p className="text-3xl text-slate-700 leading-relaxed font-bold">
                  약을 먼저 드신 다음, 아래 초록색 확인 버튼을 눌러 건강 기록을 계속 진행해 주세요.
                </p>
              </div>
              <button
                id="btn-med-confirm"
                onClick={() => {
                  playBeep();
                  setMedicationWarning(null);
                  advanceMedicationFlow(medicationsStatus);
                }}
                className="w-full py-10 bg-[#057a55] hover:bg-emerald-800 text-white text-4xl font-extrabold rounded-3xl shadow-lg cursor-pointer"
              >
                약을 먹었어요 (계속하기)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. MEASURE GUIDE STEP */}
      {currentStep === 'MEASURE_GUIDE' && (
        <div className="flex flex-col flex-1 items-center justify-between">
          <div className="text-center mt-12 px-6">
            <h1 className="text-4xl font-extrabold text-slate-900 leading-normal">
              혈압 측정 안내
            </h1>
            <p className="text-3xl text-slate-700 mt-6 leading-relaxed font-bold">
              혈압계로 혈압을 재볼까요?
            </p>
          </div>

          {/* Large Camera Shot Button & Small Manual Input Button */}
          <div className="w-full px-4 space-y-8 mb-10 flex flex-col items-center">
            <button
              id="btn-shoot-camera"
              onClick={triggerCameraStep}
              className="w-full py-16 bg-[#1a56db] hover:bg-blue-800 text-white text-4xl font-extrabold rounded-3xl shadow-xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all active:scale-[0.98] animate-pulse-slow"
            >
              <Camera className="w-16 h-16" />
              <span>카메라로 혈압 찍기</span>
            </button>

            <button
              id="btn-type-manually"
              onClick={triggerManualInputStep}
              className="py-4 px-8 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-2xl font-bold rounded-2xl flex items-center gap-2 cursor-pointer transition-all"
            >
              <Keyboard className="w-6 h-6" />
              <span>숫자로 직접 입력할게요</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. CAMERA OCR STEP */}
      {currentStep === 'CAMERA_OCR' && (
        <div className="flex flex-col flex-1 items-center justify-between relative overflow-hidden bg-black rounded-3xl">
          {/* Top text */}
          <div className="absolute top-6 left-0 right-0 text-center z-10 bg-black/60 py-3 px-4">
            <p className="text-2xl text-white font-bold leading-normal">
              혈압계 화면을 아래 네모 칸 안에 맞춰주세요
            </p>
          </div>

          {/* Viewfinder area */}
          <div className="w-full flex-1 relative flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guide Square Area */}
            <div className="absolute w-[280px] h-[340px] border-4 border-dashed border-red-500 rounded-2xl pointer-events-none flex flex-col justify-between p-4 bg-red-500/5 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
              <span className="text-xs text-red-500 font-bold bg-black/50 self-start px-2 py-0.5 rounded">수축기 (SYS)</span>
              <span className="text-xs text-red-500 font-bold bg-black/50 self-end px-2 py-0.5 rounded">이완기 (DIA)</span>
            </div>

            {/* Error or Alert state inside camera */}
            {generalAlert && (
              <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-8 z-20">
                <p className="text-3xl text-red-500 font-bold text-center leading-relaxed">
                  {generalAlert}
                </p>
              </div>
            )}

            {/* Loader */}
            {ocrLoading && (
              <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center p-8 z-30 space-y-6">
                <RefreshCw className="w-20 h-20 text-blue-600 animate-spin" />
                <p className="text-3xl text-slate-800 font-bold text-center">
                  숫자를 분석하고 있어요.<br />잠시만 그대로 기다려 주세요.
                </p>
              </div>
            )}
          </div>

          {/* Camera Buttons Bottom */}
          <div className="w-full p-6 bg-slate-900 flex justify-between items-center gap-4 z-10 shrink-0">
            <button
              id="btn-camera-cancel"
              onClick={() => {
                playBeep();
                stopCamera();
                setCurrentStep('MEASURE_GUIDE');
              }}
              className="px-6 py-6 bg-slate-700 text-white text-2xl font-bold rounded-2xl cursor-pointer"
            >
              취소
            </button>
            <button
              id="btn-camera-shutter"
              onClick={captureAndOcr}
              disabled={ocrLoading}
              className="flex-1 py-6 bg-[#e02424] active:bg-red-800 text-white text-3xl font-extrabold rounded-2xl flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
            >
              <div className="w-6 h-6 rounded-full bg-white animate-pulse" />
              <span>[찍기] 누르세요</span>
            </button>
          </div>
        </div>
      )}

      {/* 5. MANUAL INPUT STEP */}
      {currentStep === 'MANUAL_INPUT' && (
        <div className="flex flex-col flex-1 items-center justify-between">
          <div className="text-center mt-6 px-6">
            <h1 className="text-3xl font-extrabold text-slate-900 leading-normal">
              혈압 직접 입력
            </h1>
            <p className="text-2xl text-slate-600 mt-2 font-bold">
              혈압계의 숫자를 아래에 입력해 주세요.
            </p>
          </div>

          {/* Number Inputs Display */}
          <div className="flex gap-4 w-full px-4">
            <div 
              onClick={() => { playBeep(); setManualFocus('sys'); }}
              className={`flex-1 p-6 border-4 rounded-3xl text-center cursor-pointer ${
                manualFocus === 'sys' ? 'border-blue-600 bg-blue-50/35' : 'border-slate-300 bg-white'
              }`}
            >
              <p className="text-xl text-slate-500 font-bold">수축기 (높은숫자)</p>
              <p className="text-5xl font-extrabold text-slate-900 mt-2 min-h-[60px]">
                {manualSys || <span className="text-slate-300">0</span>}
              </p>
            </div>

            <div 
              onClick={() => { playBeep(); setManualFocus('dia'); }}
              className={`flex-1 p-6 border-4 rounded-3xl text-center cursor-pointer ${
                manualFocus === 'dia' ? 'border-blue-600 bg-blue-50/35' : 'border-slate-300 bg-white'
              }`}
            >
              <p className="text-xl text-slate-500 font-bold">이완기 (낮은숫자)</p>
              <p className="text-5xl font-extrabold text-slate-900 mt-2 min-h-[60px]">
                {manualDia || <span className="text-slate-300">0</span>}
              </p>
            </div>
          </div>

          {/* Keypad Grid & Enter */}
          <div className="w-full max-w-sm px-4 mb-6 space-y-4">
            <div className="grid grid-cols-3 gap-3 w-full">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  id={`btn-manual-digit-${num}`}
                  onClick={() => handleManualKeypress(num)}
                  className="h-20 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-3xl font-bold rounded-2xl flex items-center justify-center text-slate-900 cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                id="btn-manual-delete"
                onClick={handleManualBackspace}
                className="h-20 bg-red-50 text-red-600 border border-red-200 text-xl font-bold rounded-2xl flex items-center justify-center cursor-pointer"
              >
                지우기
              </button>
              <button
                id="btn-manual-digit-0"
                onClick={() => handleManualKeypress('0')}
                className="h-20 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-3xl font-bold rounded-2xl flex items-center justify-center text-slate-900 cursor-pointer"
              >
                0
              </button>
              <button
                id="btn-manual-switch-focus"
                onClick={() => {
                  playBeep();
                  if (manualFocus === 'sys') setManualFocus('dia');
                  else setManualFocus('sys');
                }}
                className="h-20 bg-slate-200 text-slate-700 text-xl font-bold rounded-2xl flex items-center justify-center cursor-pointer"
              >
                줄바꿈
              </button>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-4">
              <button
                id="btn-manual-cancel"
                onClick={() => {
                  playBeep();
                  setCurrentStep('MEASURE_GUIDE');
                }}
                className="px-6 py-6 bg-slate-700 text-white text-xl font-bold rounded-2xl cursor-pointer"
              >
                취소
              </button>
              <button
                id="btn-manual-submit"
                onClick={handleManualSubmit}
                className="flex-1 py-6 bg-[#1a56db] text-white text-2xl font-extrabold rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Check className="w-6 h-6 stroke-[3px]" />
                <span>입력 완료</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRM VALUE STEP */}
      {currentStep === 'CONFIRM' && (
        <div className="flex flex-col flex-1 items-center justify-between">
          <div className="text-center mt-6 px-6">
            <h1 className="text-3xl font-extrabold text-slate-900 leading-normal">
              측정값 확인
            </h1>
            <p className="text-2xl text-slate-600 mt-2 font-bold">
              입력된 숫자가 맞는지 봐주세요.
            </p>
          </div>

          {/* Massive Number Displays */}
          <div className="flex flex-col gap-4 w-full px-4 items-center justify-center">
            <div className="text-6xl font-extrabold text-slate-900 tracking-tight flex items-center gap-8 bg-slate-50 p-6 rounded-3xl border border-slate-200 w-full justify-center">
              <div className="text-center">
                <span className="block text-xl text-slate-500 font-bold mb-1">수축기</span>
                <span className="text-red-600">{systolic}</span>
              </div>
              <div className="text-slate-300 text-4xl">|</div>
              <div className="text-center">
                <span className="block text-xl text-slate-500 font-bold mb-1">이완기</span>
                <span className="text-blue-600">{diastolic}</span>
              </div>
            </div>

            {/* AI Speech Bubble Interpretations */}
            {systolic && diastolic && (
              <div className="w-full max-w-md bg-blue-50 border-2 border-blue-200 p-6 rounded-3xl relative mt-4 shadow-sm text-center">
                <div className="absolute top-[-14px] left-1/2 -translate-x-1/2 w-6 h-6 bg-blue-50 border-t-2 border-l-2 border-blue-200 rotate-45" />
                <p className="text-3xl font-extrabold text-blue-900 leading-normal">
                  {getBloodPressureStatus(systolic, diastolic) === '정상' && (
                    "혈압이 정상이에요. 오늘도 건강한 하루 보내세요! 😊"
                  )}
                  {getBloodPressureStatus(systolic, diastolic) === '경계' && (
                    "혈압이 조금 높아요. 물 한 컵 마시고 잠시 쉬세요. ☕"
                  )}
                  {getBloodPressureStatus(systolic, diastolic) === '위험' && (
                    "혈압이 많이 높아요! 지금 바로 보호자에게 알릴게요. 🚨"
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Confirmation trigger */}
          <div className="w-full px-4 mb-8 space-y-4">
            {smsStatus && (
              <div className="p-4 bg-orange-100 border border-orange-200 text-orange-800 text-2xl font-bold rounded-2xl text-center">
                {smsStatus === '전송중' ? '보호자분께 위험 문자 보내는 중...' : '보호자께 위험 예방 문자를 보냈어요.'}
              </div>
            )}
            <div className="flex gap-4">
              <button
                id="btn-confirm-retry"
                onClick={() => {
                  playBeep();
                  if (manualSys || manualDia) {
                    setCurrentStep('MANUAL_INPUT');
                  } else {
                    triggerCameraStep();
                  }
                }}
                className="px-6 py-8 bg-slate-200 text-slate-800 text-2xl font-bold rounded-2xl cursor-pointer"
              >
                다시하기
              </button>
              <button
                id="btn-confirm-ok"
                onClick={handleConfirmValues}
                disabled={ocrLoading}
                className="flex-1 py-8 bg-[#1a56db] text-white text-4xl font-extrabold rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99] disabled:opacity-50"
              >
                {ocrLoading ? <RefreshCw className="w-8 h-8 animate-spin" /> : <CheckCircle2 className="w-10 h-10" />}
                <span>확인했어요</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. COMPLETE STEP */}
      {currentStep === 'COMPLETE' && (
        <div className="flex flex-col flex-1 items-center justify-between">
          <div className="text-center mt-12 px-6">
            <CheckCircle2 className="w-32 h-32 text-[#057a55] mx-auto animate-pulse" />
            <h1 className="text-4xl font-extrabold text-[#057a55] mt-6 leading-normal">
              기록 완료!
            </h1>
            <p className="text-3xl text-slate-800 mt-4 leading-normal font-bold">
              잘 하셨어요! 오늘도 건강하세요 😊
            </p>
            {/* Timestamp */}
            <p className="text-2xl text-slate-500 mt-4 font-normal">
              {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 오후 {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          </div>

          {/* Action options */}
          <div className="w-full px-4 mb-8 space-y-4">
            {smsStatus && (
              <div className="p-4 bg-emerald-100 border border-emerald-200 text-emerald-800 text-2xl font-bold rounded-2xl text-center">
                {smsStatus}
              </div>
            )}
            
            <button
              id="btn-complete-send-sms"
              onClick={sendManualSms}
              className="w-full py-10 bg-[#057a55] text-white text-3xl font-extrabold rounded-3xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
            >
              <Check className="w-10 h-10 stroke-[3px]" />
              <span>보호자에게 보내기</span>
            </button>

            <button
              id="btn-complete-home"
              onClick={handleFinish}
              className="w-full py-6 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-2xl font-bold rounded-2xl cursor-pointer"
            >
              첫 화면으로 돌아가기 (앱 잠금)
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
