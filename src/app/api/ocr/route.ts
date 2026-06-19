import { NextResponse } from 'next/server';

// Regular expression to extract all 2 or 3-digit numbers
const NUMBER_PATTERN = /\b(\d{2,3})\b/g;

interface VisionTextAnnotation {
  description: string;
}

interface VisionResponse {
  responses: Array<{
    textAnnotations?: VisionTextAnnotation[];
    fullTextAnnotation?: {
      text: string;
    };
  }>;
}

export async function POST(request: Request) {
  try {
    const { image } = await request.json(); // base64 representation of image

    if (!image) {
      return NextResponse.json({ error: '이미지 데이터가 없습니다.' }, { status: 400 });
    }

    const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || !process.env.GOOGLE_CLOUD_VISION_API_KEY;

    if (mockMode) {
      // Simulation logic for UX testing: return random realistic values
      console.log('[OCR API] Running in Mock Mode');
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate network latency

      // 80% chance of success, 20% failure simulation
      if (Math.random() < 0.15) {
        return NextResponse.json(
          { error: '잘 안 보여요. 더 가까이 대고 흔들리지 않게 찍어주세요.' },
          { status: 422 }
        );
      }

      // Generate random blood pressure values: normal (60%), borderline (30%), crisis (10%)
      const rand = Math.random();
      let systolic = 120;
      let diastolic = 80;

      if (rand < 0.6) {
        // Normal
        systolic = Math.floor(Math.random() * (129 - 110 + 1)) + 110;
        diastolic = Math.floor(Math.random() * (84 - 70 + 1)) + 70;
      } else if (rand < 0.9) {
        // Borderline / Slightly High
        systolic = Math.floor(Math.random() * (145 - 130 + 1)) + 130;
        diastolic = Math.floor(Math.random() * (95 - 85 + 1)) + 85;
      } else {
        // Crisis / High
        systolic = Math.floor(Math.random() * (190 - 180 + 1)) + 180;
        diastolic = Math.floor(Math.random() * (120 - 110 + 1)) + 110;
      }

      return NextResponse.json({
        success: true,
        systolic,
        diastolic,
        isMock: true,
      });
    }

    // Prepare Base64 payload for Google Cloud Vision API
    // Strip headers like "data:image/jpeg;base64," if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: 'TEXT_DETECTION',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR API] Google Vision API Error:', errorText);
      return NextResponse.json({ error: '글자 인식 서버 오류가 발생했습니다.' }, { status: 500 });
    }

    const data: VisionResponse = await response.json();
    const annotations = data.responses[0]?.textAnnotations;

    if (!annotations || annotations.length === 0) {
      return NextResponse.json(
        { error: '글자를 찾지 못했습니다. 화면이 밝고 선명한지 확인해 주세요.' },
        { status: 422 }
      );
    }

    const fullText = annotations[0].description;
    console.log('[OCR API] Extracted text from camera:', fullText);

    // Heuristically extract systolic and diastolic values
    // Search for numbers in the text
    const numbers: number[] = [];
    let match;
    // Reset pattern index
    NUMBER_PATTERN.lastIndex = 0;
    while ((match = NUMBER_PATTERN.exec(fullText)) !== null) {
      numbers.push(parseInt(match[1], 10));
    }

    if (numbers.length < 2) {
      return NextResponse.json(
        { error: '혈압계 숫자가 인식되지 않았습니다. 더 가까이 대주세요.' },
        { status: 422 }
      );
    }

    // Heuristic:
    // Typically, Systolic is higher than Diastolic.
    // Systolic is usually between 90 and 220.
    // Diastolic is usually between 50 and 130.
    // Let's filter out realistic ranges and sort.
    const systolicCandidates = numbers.filter(n => n >= 90 && n <= 220);
    const diastolicCandidates = numbers.filter(n => n >= 40 && n <= 130);

    let systolic: number | null = null;
    let diastolic: number | null = null;

    if (systolicCandidates.length > 0 && diastolicCandidates.length > 0) {
      // Find the highest valid systolic candidate
      systolic = Math.max(...systolicCandidates);
      // Find a diastolic candidate that is smaller than systolic
      const validDiastolics = diastolicCandidates.filter(d => d < systolic!);
      if (validDiastolics.length > 0) {
        diastolic = Math.max(...validDiastolics);
      } else {
        diastolic = Math.min(...diastolicCandidates);
      }
    }

    if (systolic === null || diastolic === null || systolic === diastolic) {
      // Fallback: take the first two numbers if they make basic sense
      // Often the screen prints Systolic first, then Diastolic.
      const candidate1 = numbers[0];
      const candidate2 = numbers[1];
      if (candidate1 > candidate2) {
        systolic = candidate1;
        diastolic = candidate2;
      } else {
        systolic = candidate2;
        diastolic = candidate1;
      }
    }

    // Safety checks for final values
    if (systolic < 50 || systolic > 250 || diastolic < 30 || diastolic > 180) {
      return NextResponse.json(
        { error: '인식된 숫자가 혈압 범위에서 벗어납니다. 다시 찍어주세요.' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      systolic,
      diastolic,
      rawText: fullText,
    });
  } catch (error) {
    console.error('[OCR API] Exception:', error);
    return NextResponse.json({ error: '서버 내부 오류가 발생했습니다.' }, { status: 500 });
  }
}
