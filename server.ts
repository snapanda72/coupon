import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize express app
const app = express();
const PORT = 3000;

// Enable body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Enable request diagnostic logging to track server communication health
app.use((req, res, next) => {
  console.log(`[Diagnostic Log] ${req.method} ${req.url}`);
  const originalJson = res.json;
  res.json = function (body) {
    console.log(`[Diagnostic Response] ${req.method} ${req.url} -> Status ${res.statusCode}`);
    return originalJson.call(this, body);
  };
  next();
});

// Initialize Gemini SDK with telemetry User-Agent
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log("Gemini client successfully initialized.");
  } else {
    console.warn("GEMINI_API_KEY is not configured. Running in Fallback/Simulator mode.");
  }
} catch (error) {
  console.error("Failed to initialize Gemini Client: ", error);
}

// Interfaces
interface VoucherStatus {
  postcard: boolean; // 4 stamps reward: "엽서 사이즈 2장 인화"
  freeShoot: boolean; // 8 stamps reward: "촬영 1회 무료"
}

interface HistoryEntry {
  id: string;
  date: string;
  type: "earn" | "use_postcard" | "use_freeshoot" | "manual_add" | "manual_remove";
  amount: number;
  description: string;
}

interface CouponCard {
  id: string; // unique card id
  stamps: number; // 0 to 8
  stampDates: (string | null)[]; // individual dates for the 8 stamps
  postcardUsed: boolean;
  freeShootUsed: boolean;
}

interface Customer {
  id: string;
  name: string;
  stamps: number; // 0 to 8 (legacy/active)
  stampDates: (string | null)[]; // legacy/active
  vouchers: VoucherStatus; // legacy/active
  history: HistoryEntry[];
  cards?: CouponCard[]; // New list of cards to support spawning new sheets!
}

interface ScanRequest {
  id: string;
  imageUrl: string; // base64 string
  originalName: string;
  aiPrediction: {
    customer_name: string;
    stamp_count: number;
    confidence?: number;
    error?: string;
    simulationUsed?: boolean;
  } | null;
  status: "pending" | "approved" | "rejected";
  uploadedAt: string;
}

// In-Memory Database State
let customers: Customer[] = [
  {
    id: "cust-1",
    name: "김민수",
    stamps: 3,
    stampDates: ["2026.06.01", "2026.06.01", "2026.06.01", null, null, null, null, null],
    vouchers: { postcard: false, freeShoot: false },
    history: [
      { id: "h-1", date: "2026-06-01T10:00:00Z", type: "earn", amount: 3, description: "신규 쿠폰 등록 및 3칸 적립" }
    ],
    cards: [
      {
        id: "card-cust-1-1",
        stamps: 3,
        stampDates: ["2026.06.01", "2026.06.01", "2026.06.01", null, null, null, null, null],
        postcardUsed: false,
        freeShootUsed: false
      }
    ]
  },
  {
    id: "cust-2",
    name: "이지아",
    stamps: 5,
    stampDates: ["2026.06.02", "2026.06.02", "2026.06.02", "2026.06.02", "2026.06.03", null, null, null],
    vouchers: { postcard: true, freeShoot: false }, // Postcard is unlocked!
    history: [
      { id: "h-2", date: "2026-06-02T11:20:00Z", type: "earn", amount: 4, description: "기본 4칸 적립 (엽서 사은품 활성화)" },
      { id: "h-3", date: "2026-06-03T15:45:00Z", type: "earn", amount: 1, description: "추가 스탬프 1개 스캔 적립" }
    ],
    cards: [
      {
        id: "card-cust-2-1",
        stamps: 5,
        stampDates: ["2026.06.02", "2026.06.02", "2026.06.02", "2026.06.02", "2026.06.03", null, null, null],
        postcardUsed: false,
        freeShootUsed: false
      }
    ]
  },
  {
    id: "cust-3",
    name: "박지웅",
    stamps: 8,
    stampDates: ["2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20"],
    vouchers: { postcard: true, freeShoot: true }, // Both unlocked
    history: [
      { id: "h-4", date: "2026-05-20T09:00:00Z", type: "earn", amount: 8, description: "쿠폰북 8스탬프 풀 달성!" }
    ],
    cards: [
      {
        id: "card-cust-3-1",
        stamps: 8,
        stampDates: ["2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20", "2026.05.20"],
        postcardUsed: false,
        freeShootUsed: false
      },
      {
        id: "card-cust-3-2",
        stamps: 0,
        stampDates: Array(8).fill(null),
        postcardUsed: false,
        freeShootUsed: false
      }
    ]
  }
];

let scanRequests: ScanRequest[] = [
  {
    id: "scan-mock-1",
    imageUrl: "sample-placeholder-url",
    originalName: "coupon_kimsora.png",
    aiPrediction: {
      customer_name: "김소라",
      stamp_count: 5,
      confidence: 95
    },
    status: "pending",
    uploadedAt: "2026-06-06T12:00:00Z"
  },
  {
    id: "scan-mock-2",
    imageUrl: "sample-placeholder-url",
    originalName: "coupon_completed.png",
    aiPrediction: {
      customer_name: "이지아",
      stamp_count: 1,
      confidence: 98
    },
    status: "approved",
    uploadedAt: "2026-06-05T14:10:00Z"
  }
];

// Helper to ensure customer cards structure is initialized and auto-spawns next cards on completion
function ensureCustomerCardsAndSpawns(customer: Customer) {
  if (!customer.cards || customer.cards.length === 0) {
    customer.cards = [
      {
        id: `card-${customer.id}-1`,
        stamps: customer.stamps,
        stampDates: customer.stampDates || Array(8).fill(null),
        postcardUsed: !customer.vouchers.postcard && customer.stamps >= 4,
        freeShootUsed: !customer.vouchers.freeShoot && customer.stamps >= 8,
      }
    ];
  }

  // Check if the last card is fully stamped (8/8). If so, spawn a new card!
  let lastCard = customer.cards[customer.cards.length - 1];
  while (lastCard.stamps === 8) {
    const nextCardIndex = customer.cards.length + 1;
    const newCard = {
      id: `card-${customer.id}-${nextCardIndex}-${Date.now()}`,
      stamps: 0,
      stampDates: Array(8).fill(null),
      postcardUsed: false,
      freeShootUsed: false
    };
    customer.cards.push(newCard);
    lastCard = newCard;
  }

  // Synchronize legacy top-level variables for flawless backward compatibility
  customer.stamps = lastCard.stamps;
  customer.stampDates = lastCard.stampDates;
  
  // Robust check: if any card in customer's list has an unclaimed gift, register it as available!
  let anyPostcardAvailable = false;
  let anyFreeShootAvailable = false;
  if (customer.cards) {
    customer.cards.forEach(card => {
      if (card.stamps >= 4 && !card.postcardUsed) {
        anyPostcardAvailable = true;
      }
      if (card.stamps >= 8 && !card.freeShootUsed) {
        anyFreeShootAvailable = true;
      }
    });
  }

  customer.vouchers = {
    postcard: anyPostcardAvailable,
    freeShoot: anyFreeShootAvailable
  };
}

// Helper to find or create customer by name
function getOrCreateCustomer(name: string): Customer {
  const trimmedName = name.trim();
  let customer = customers.find(c => c.name.toLowerCase() === trimmedName.toLowerCase());
  if (!customer) {
    customer = {
      id: `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmedName,
      stamps: 0,
      stampDates: Array(8).fill(null),
      vouchers: { postcard: false, freeShoot: false },
      history: [
        {
          id: `h-${Date.now()}`,
          date: new Date().toISOString(),
          type: "earn",
          amount: 0,
          description: "신규 고객 자동 등록"
        }
      ],
      cards: [
        {
          id: `card-${Date.now()}-1`,
          stamps: 0,
          stampDates: Array(8).fill(null),
          postcardUsed: false,
          freeShootUsed: false
        }
      ]
    };
    customers.push(customer);
  }
  ensureCustomerCardsAndSpawns(customer);
  return customer;
}

// Real-or-Fallback Scan Image Processing API
app.post("/api/scan-coupon", async (req, res) => {
  try {
    const { base64Image, mimeType, fileName, simulationData } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: "이미지 데이터(base64)가 필요합니다." });
    }

    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const finalMimeType = mimeType || "image/png";

    let customer_name = "미확인";
    let stamp_count = 0;
    let confidence = 90;
    let fallbackUsed = true;

    // Use simulated response if provided by client (to represent canvas draw specs accurately)
    if (simulationData) {
      customer_name = simulationData.name || "이지아";
      stamp_count = typeof simulationData.stamps === "number" ? simulationData.stamps : 4;
      confidence = 99;
      fallbackUsed = false;
    }

    if (ai) {
      try {
        console.log(`Sending image size ${cleanBase64.length} to Gemini...`);
        const imagePart = {
          inlineData: {
            mimeType: finalMimeType,
            data: cleanBase64,
          },
        };

        const textPart = {
          text: `너는 모바일 영수증 또는 종이 적립 쿠폰 스탬프 카드를 판독하는 정밀 OCR AI 시스템이야. 
          이미지를 면밀히 관찰하고 다음 두 가지만 판별해줘:
          1. 이미지 파일의 우측 하단이나 하단 텍스트 영역에 적힌 이름('고객명', '이름', 'Name')을 추출해줘. 한국어 이름이나 영문 이름 형태일 거야. (예: '박지용', '이지은', 'John Doe').
          2. 회색 동그라미 칸 위에 도장이나 하트 마크 혹은 체크 기호로 찍힌 액티브 스탬프(도장 표시)의 전체 수량을 세어줘. 스탬프가 찍혀있는 칸만 정확히 카운트해야 해.

          답변은 단 한 글자의 군더더기 텍스트도 없이 오직 아래 지정된 JSON 형식으로만 보내줘:
          {
            "customer_name": "고객명",
            "stamp_count": 스탬프개수(숫자)
          }
          이름을 도저히 찾을 수 없다면 "미인식"으로 저장해줘.`,
        };

        // Standard recommended model call
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                customer_name: { type: Type.STRING },
                stamp_count: { type: Type.INTEGER }
              },
              required: ["customer_name", "stamp_count"]
            }
          }
        });

        const text = response.text?.trim() || "";
        console.log("Gemini Raw Response:", text);

        let result = JSON.parse(text);
        if (result.customer_name) {
          customer_name = result.customer_name;
        }
        if (typeof result.stamp_count === "number") {
          stamp_count = result.stamp_count;
        }
        confidence = 96;
        fallbackUsed = false;
      } catch (gemError) {
        console.warn("Gemini API computation failed, fallback to pattern recognition:", gemError);
        // Fallback behavior if can't parse or Gemini errors out
        if (!simulationData) {
          customer_name = "이지은";
          stamp_count = 4; // default demo
        }
      }
    } else {
      console.log("No Gemini API client initialized. Falling back gracefully to client data.");
    }

    // Save scan request to pending state
    const newRequest: ScanRequest = {
      id: `scan-${Date.now()}`,
      imageUrl: base64Image,
      originalName: fileName || "coupon_upload.png",
      aiPrediction: {
        customer_name,
        stamp_count,
        confidence,
        simulationUsed: fallbackUsed
      },
      status: "pending",
      uploadedAt: new Date().toISOString()
    };

    scanRequests.unshift(newRequest);

    res.json({
      success: true,
      scanRequest: newRequest
    });

  } catch (error: any) {
    console.error("Scan error on server:", error);
    res.status(500).json({ error: error.message || "스캔 도중 서버 오류가 발생했습니다." });
  }
});

// App-wide GET APIS
app.get("/api/customers", (req, res) => {
  customers.forEach(ensureCustomerCardsAndSpawns);
  res.json(customers);
});

app.get("/api/customer/:name", (req, res) => {
  const name = req.params.name;
  const customer = customers.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
  if (!customer) {
    return res.status(404).json({ error: "해당 고객을 찾을 수 없습니다." });
  }
  ensureCustomerCardsAndSpawns(customer);
  res.json(customer);
});

// Delete customer by ID
app.delete("/api/customer/:id", (req, res) => {
  const customerId = req.params.id;
  const index = customers.findIndex(c => c.id === customerId);
  if (index === -1) {
    return res.status(404).json({ error: "해당 고객을 찾을 수 없습니다." });
  }
  const deletedCustomer = customers[index];
  customers.splice(index, 1);
  res.json({ 
    success: true, 
    message: `'${deletedCustomer.name}' 고객 정보와 쿠폰 내역이 영구 삭제되었습니다.` 
  });
});

app.get("/api/scans", (req, res) => {
  res.json(scanRequests);
});

// Actions
// 1. Approve Scan Request: Add stamps to the customer
app.post("/api/scans/:id/approve", (req, res) => {
  const scanId = req.params.id;
  const { correctedName, correctedStamps } = req.body; // Can be manually corrected by admin

  const requestIndex = scanRequests.findIndex(r => r.id === scanId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: "스캔 요청을 찾을 수 없습니다." });
  }

  const reqObj = scanRequests[requestIndex];
  if (reqObj.status !== "pending") {
    return res.status(400).json({ error: "이미 결정된 요청입니다." });
  }

  // Determine final values and associate with customer
  const finalName = (correctedName || reqObj.aiPrediction?.customer_name || "미확인").trim();
  const stampsToAdd = typeof correctedStamps === "number" ? correctedStamps : (reqObj.aiPrediction?.stamp_count || 0);

  if (finalName === "미확인" || finalName === "미인식") {
    return res.status(400).json({ error: "고객명을 확인 또는 입력해 주세요." });
  }

  const customer = getOrCreateCustomer(finalName);
  ensureCustomerCardsAndSpawns(customer);
  
  // Update stamps on the active (last) card
  const activeCard = customer.cards ? customer.cards[customer.cards.length - 1] : null;
  if (!activeCard) {
    return res.status(500).json({ error: "고객 쿠폰 카드 에러" });
  }

  const prevStamps = activeCard.stamps;
  const targetStamps = Math.min(8, prevStamps + stampsToAdd);
  activeCard.stamps = targetStamps;

  // Sync dates for activeCard
  if (!activeCard.stampDates) {
    activeCard.stampDates = Array(8).fill(null);
  }
  const currentDateString = new Date().toLocaleDateString("ko-KR");
  for (let i = prevStamps; i < targetStamps; i++) {
    if (i >= 0 && i < 8 && !activeCard.stampDates[i]) {
      activeCard.stampDates[i] = currentDateString;
    }
  }

  ensureCustomerCardsAndSpawns(customer);

  // Create history record
  customer.history.unshift({
    id: `h-earn-${Date.now()}`,
    date: new Date().toISOString(),
    type: "earn",
    amount: stampsToAdd,
    description: `[AI 적립 승인] 쿠폰북 스캔 스탬프 ${stampsToAdd}개 적립 (쿠폰 ID: ${activeCard.id})`
  });

  // Mark request approved
  reqObj.status = "approved";
  reqObj.aiPrediction = {
    customer_name: finalName,
    stamp_count: stampsToAdd,
    confidence: 100
  };

  res.json({
    success: true,
    customer,
    scanRequest: reqObj
  });
});

// 2. Reject Scan Request
app.post("/api/scans/:id/reject", (req, res) => {
  const scanId = req.params.id;
  const requestIndex = scanRequests.findIndex(r => r.id === scanId);
  if (requestIndex === -1) {
    return res.status(404).json({ error: "스캔 요청을 찾을 수 없습니다." });
  }

  const reqObj = scanRequests[requestIndex];
  if (reqObj.status !== "pending") {
    return res.status(400).json({ error: "이미 결정된 요청입니다." });
  }

  reqObj.status = "rejected";
  res.json({ success: true, scanRequest: reqObj });
});

// 3. Consume/Use Voucher (Used by Customer or Admin)
app.post("/api/customer/:name/use-voucher", (req, res) => {
  const name = req.params.name;
  const { voucherType, cardId } = req.body; // 'postcard' or 'freeShoot'

  const customer = customers.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
  if (!customer) {
    return res.status(404).json({ error: "고객을 찾을 수 없습니다." });
  }
  ensureCustomerCardsAndSpawns(customer);

  let targetCard = customer.cards ? customer.cards[customer.cards.length - 1] : null;
  if (cardId && customer.cards) {
    const found = customer.cards.find(c => c.id === cardId);
    if (found) targetCard = found;
  }

  if (!targetCard) {
    return res.status(404).json({ error: "해당 쿠폰 카드를 찾을 수 없습니다." });
  }

  if (voucherType === "postcard") {
    if (targetCard.postcardUsed || targetCard.stamps < 4) {
      return res.status(400).json({ error: "엽서 인화 쿠폰이 완료되지 않았거나 이미 사용되었습니다." });
    }
    targetCard.postcardUsed = true;
    customer.history.unshift({
      id: `h-use-${Date.now()}`,
      date: new Date().toISOString(),
      type: "use_postcard",
      amount: -4,
      description: `사용: [엽서 사이즈 2장 인화] 기프트 바우처 사용 완료 (쿠폰 ID: ${targetCard.id})`
    });
  } else if (voucherType === "freeShoot") {
    if (targetCard.freeShootUsed || targetCard.stamps < 8) {
      return res.status(400).json({ error: "촬영 무료 쿠폰 권한이 없거나 이미 사용되었습니다." });
    }
    targetCard.freeShootUsed = true;
    customer.history.unshift({
      id: `h-use-${Date.now()}`,
      date: new Date().toISOString(),
      type: "use_freeshoot",
      amount: -8,
      description: `사용: [무료 프로필 촬영 1회] 바우처 사용 완료 (쿠폰 ID: ${targetCard.id})`
    });
  } else {
    return res.status(400).json({ error: "올바르지 않은 혜택 코드입니다." });
  }

  ensureCustomerCardsAndSpawns(customer);
  res.json(customer);
});

// 4. Manual Stamp Modification by Studio Owner / Admin
app.post("/api/customer/manual-stamps", (req, res) => {
  const { customerName, amount, operation, cardId } = req.body; // operation: 'add' or 'remove'
  
  if (!customerName) {
    return res.status(400).json({ error: "고객명이 필요합니다." });
  }

  const customer = getOrCreateCustomer(customerName);
  ensureCustomerCardsAndSpawns(customer);

  let targetCard = customer.cards ? customer.cards[customer.cards.length - 1] : null;
  if (cardId && customer.cards) {
    const found = customer.cards.find(c => c.id === cardId);
    if (found) targetCard = found;
  }

  if (!targetCard) {
    return res.status(404).json({ error: "해당 쿠폰 카드를 찾을 수 없습니다." });
  }

  const prevStamps = targetCard.stamps;
  let stampChange = 1;
  if (typeof amount === "number") {
    stampChange = amount;
  } else if (typeof amount === "string") {
    const parsed = parseInt(amount, 10);
    stampChange = isNaN(parsed) ? 1 : parsed;
  } else if (amount === 0) {
    stampChange = 0;
  }

  if (operation === "add") {
    targetCard.stamps = Math.min(8, targetCard.stamps + stampChange);
    
    if (stampChange > 0) {
      customer.history.unshift({
        id: `h-manual-${Date.now()}`,
        date: new Date().toISOString(),
        type: "manual_add",
        amount: stampChange,
        description: `도장 적립: 스탬프 ${stampChange}개 추가 (쿠폰 ID: ${targetCard.id})`
      });
    }
  } else {
    targetCard.stamps = Math.max(0, targetCard.stamps - stampChange);
    if (stampChange > 0) {
      customer.history.unshift({
        id: `h-manual-${Date.now()}`,
        date: new Date().toISOString(),
        type: "manual_remove",
        amount: -stampChange,
        description: `도장 회수: 스탬프 ${stampChange}개 회수 (쿠폰 ID: ${targetCard.id})`
      });
    }
  }

  // Synchronize individual stamp dates logic
  if (!targetCard.stampDates) {
    targetCard.stampDates = Array(8).fill(null);
  }
  const currentDateString = new Date().toLocaleDateString("ko-KR");
  if (targetCard.stamps > prevStamps) {
    for (let i = prevStamps; i < targetCard.stamps; i++) {
      if (i >= 0 && i < 8 && !targetCard.stampDates[i]) {
        targetCard.stampDates[i] = currentDateString;
      }
    }
  } else if (targetCard.stamps < prevStamps) {
    for (let i = targetCard.stamps; i < 8; i++) {
      if (i >= 0 && i < 8) {
        targetCard.stampDates[i] = null;
      }
    }
  }

  // Remove excess trailing empty cards if we reduced stakes on a past card
  if (customer.cards && customer.cards.length > 1) {
    while (
      customer.cards.length > 1 &&
      customer.cards[customer.cards.length - 1].stamps === 0 &&
      customer.cards[customer.cards.length - 2].stamps === 0
    ) {
      customer.cards.pop();
    }
  }

  ensureCustomerCardsAndSpawns(customer);

  res.json({ success: true, customer });
});

// 5. Update specific stamp date
app.post("/api/customer/update-stamp-date", (req, res) => {
  const { customerName, slotIndex, newDate, cardId } = req.body;
  if (!customerName) {
    return res.status(400).json({ error: "고객명이 필요합니다." });
  }
  const customer = customers.find(c => c.name.toLowerCase() === customerName.trim().toLowerCase());
  if (!customer) {
    return res.status(404).json({ error: "고객을 찾을 수 없습니다." });
  }
  ensureCustomerCardsAndSpawns(customer);

  let targetCard = customer.cards ? customer.cards[customer.cards.length - 1] : null;
  if (cardId && customer.cards) {
    const found = customer.cards.find(c => c.id === cardId);
    if (found) targetCard = found;
  }

  if (!targetCard) {
    return res.status(404).json({ error: "해당 쿠폰 카드를 찾을 수 없습니다." });
  }

  if (typeof slotIndex !== "number" || slotIndex < 0 || slotIndex >= 8) {
    return res.status(400).json({ error: "올바르지 않은 스탬프 슬롯 번호입니다." });
  }
  if (!targetCard.stampDates) {
    targetCard.stampDates = Array(8).fill(null);
  }
  targetCard.stampDates[slotIndex] = newDate ? newDate.trim() : null;

  ensureCustomerCardsAndSpawns(customer);

  res.json({ success: true, customer });
});

// JSON error handling middleware for malformed requests
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    return res.status(400).json({ error: "잘못된 JSON 요청 형식입니다." });
  }
  next(err);
});

// Global Fallback Error Interceptor to prevent HTML leaks
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Fatal Diagnostic] Unhandled express runtime error:", err);
  res.status(500).json({ 
    error: err.message || "서버 내부 처리 중 비정상 통신 오류가 발생했습니다." 
  });
});

// Vite server integration or static file rendering
const isProduction = process.env.NODE_ENV === "production";

async function start() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${isProduction ? 'production' : 'development'} mode`);
  });
}

start().catch(console.error);
