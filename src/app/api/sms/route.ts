import { NextResponse } from 'next/server';
import twilio from 'twilio';

// Helper to format Korean phone numbers to E.164 format (+8210...)
function formatKoreanPhoneNumber(phone: string): string {
  // Remove non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('010') && cleaned.length === 11) {
    return `+82${cleaned.substring(1)}`;
  }
  if (cleaned.startsWith('10') && cleaned.length === 10) {
    return `+82${cleaned}`;
  }
  if (cleaned.startsWith('8210') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  
  // If it's already in international format or other format, return as is (with prepended + if missing)
  if (phone.startsWith('+')) return phone;
  return `+${cleaned}`;
}

export async function POST(request: Request) {
  try {
    const { patientName, guardianPhone, message } = await request.json();

    if (!guardianPhone || !message) {
      return NextResponse.json({ error: '필수 매개변수(수신 번호, 메시지)가 누락되었습니다.' }, { status: 400 });
    }

    const formattedPhone = formatKoreanPhoneNumber(guardianPhone);
    const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || 
                     !process.env.TWILIO_ACCOUNT_SID || 
                     !process.env.TWILIO_AUTH_TOKEN || 
                     !process.env.TWILIO_FROM_NUMBER;

    if (mockMode) {
      console.log(`[SMS API - MOCK MODE] Sending SMS to: ${formattedPhone}`);
      console.log(`[SMS API - MOCK MODE] Message: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Latency sim
      return NextResponse.json({
        success: true,
        isMock: true,
        to: formattedPhone,
        message,
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    const client = twilio(accountSid, authToken);

    const smsResponse = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone,
    });

    console.log('[SMS API] SMS sent successfully, SID:', smsResponse.sid);

    return NextResponse.json({
      success: true,
      sid: smsResponse.sid,
      to: formattedPhone,
    });
  } catch (error: any) {
    console.error('[SMS API] Exception:', error);
    return NextResponse.json({ error: error.message || 'SMS 전송 중 서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
