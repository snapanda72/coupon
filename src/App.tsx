import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { 
  User, 
  Sparkles, 
  Search, 
  Clock, 
  Plus, 
  Minus, 
  X, 
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Interfaces matched with server.ts
interface VoucherStatus {
  postcard: boolean;
  freeShoot: boolean;
}

interface HistoryEntry {
  id: string;
  date: string;
  type: "earn" | "use_postcard" | "use_freeshoot" | "manual_add" | "manual_remove";
  amount: number;
  description: string;
}

interface CouponCard {
  id: string;
  stamps: number;
  stampDates: (string | null)[];
  postcardUsed: boolean;
  freeShootUsed: boolean;
}

interface Customer {
  id: string;
  name: string;
  stamps: number;
  stampDates: (string | null)[];
  vouchers: VoucherStatus;
  history: HistoryEntry[];
  cards?: CouponCard[];
}

export default function App() {
  // Sync state lists
  const [customers, setCustomers] = useState<Customer[]>([]);
  
  // Active Customer Select States
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("cust-2");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCardId, setActiveCardId] = useState<string>(""); // Sub-coupon page index state
  
  // Add Customer Input
  const [newCustomerName, setNewCustomerName] = useState<string>("");
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  
  // Stamp date editing state
  const [editingSlotIdx, setEditingSlotIdx] = useState<number | null>(null);
  const [tempDateVal, setTempDateVal] = useState<string>("");

  // Status check messages
  const [systemMessage, setSystemMessage] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  // Custom dialog confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Active loaded client
  const activeCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0] || null;
  const customerCards = activeCustomer?.cards || [];
  const activeCard = customerCards.find(c => c.id === activeCardId) || customerCards[customerCards.length - 1] || null;

  // Load backend data on load
  useEffect(() => {
    fetchData();
  }, []);

  // Autofocus the active customer's latest active coupon sheet
  useEffect(() => {
    if (activeCustomer && activeCustomer.cards && activeCustomer.cards.length > 0) {
      const cards = activeCustomer.cards;
      const lastCard = cards[cards.length - 1];
      const keepsSelected = cards.some(c => c.id === activeCardId);
      if (!keepsSelected) {
        setActiveCardId(lastCard.id);
      }
    } else {
      if (activeCardId !== "") {
        setActiveCardId("");
      }
    }
  }, [selectedCustomerId, activeCustomer?.cards, activeCardId]);

  const showMsg = (text: string, type: "success" | "info" = "success") => {
    setSystemMessage({ text, type });
    setTimeout(() => {
      setSystemMessage(null);
    }, 4500);
  };

  const fetchData = async () => {
    try {
      const custRes = await fetch("/api/customers");
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
        // Default select if not set
        if (custData.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(custData[0].id);
        }
      } else {
        const errText = await custRes.text().catch(() => "Unknown body");
        console.error("Customers list fetch failed with status:", custRes.status, errText);
        showMsg(`서버 오류 (${custRes.status}): 다시 시도해주세요.`, "info");
      }
    } catch (e) {
      console.error("Local full-stack endpoints diagnostics:", e);
      showMsg("서버 통신 실패 (네트워크 연결 끊김)", "info");
    }
  };

  // Create new customer profile on the fly
  const handleAddNewCustomer = async (e: FormEvent) => {
    e.preventDefault();
    const name = newCustomerName.trim();
    if (!name) return;

    try {
      const response = await fetch("/api/customer/manual-stamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          amount: 0,
          operation: "add"
        })
      });

      if (response.ok) {
        const resData = await response.json();
        setNewCustomerName("");
        setShowAddForm(false);
        await fetchData();
        if (resData.customer) {
          setSelectedCustomerId(resData.customer.id);
        }
        showMsg(`새로운 고객 '${name}' 도장첩을 성공적으로 개설하였습니다!`);
      } else {
        const err = await response.json();
        showMsg(err.error || "신규 개설에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      showMsg("서버 통신 실패");
    }
  };

  // Adjust stamps count directly (+/-)
  const handleStampChange = async (name: string, amount: number, op: "add" | "remove") => {
    if (!activeCard) return;
    try {
      const response = await fetch("/api/customer/manual-stamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          amount,
          operation: op,
          cardId: activeCard.id
        })
      });

      if (response.ok) {
        await fetchData();
      } else {
        const resJson = await response.json();
        showMsg(resJson.error || "조정 실패");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Interactive card click logic: Click on empty or active slot to set stamp count directly!
  const handleCircleSlotClick = async (slotIndex: number) => {
    if (!activeCustomer || !activeCard) return;
    
    // Convert 1-based index (1 to 8)
    const currentCount = activeCard.stamps;
    let targetCount = slotIndex;
    
    // Toggle logic: If they click on their exact current stamp count, subtract 1.
    if (currentCount === slotIndex) {
      targetCount = slotIndex - 1;
    }

    const difference = targetCount - currentCount;
    if (difference === 0) return;

    const op = difference > 0 ? "add" : "remove";
    const amount = Math.abs(difference);

    try {
      const response = await fetch("/api/customer/manual-stamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: activeCustomer.name,
          amount: amount,
          operation: op,
          cardId: activeCard.id
        })
      });

      if (response.ok) {
        await fetchData();
        showMsg(`'${activeCustomer.name}' 스탬프를 ${targetCount}개로 조율했습니다.`);
      } else {
        const resJson = await response.json();
        showMsg(resJson.error || "스탬프 설정 중 오류");
      }
    } catch (err) {
      console.error(err);
      showMsg("도장 직접 조율 통신 실패");
    }
  };

  // Edit individual stamp's date
  const handleSaveStampDate = async (slotIdxZeroBased: number) => {
    if (!activeCustomer || !activeCard || editingSlotIdx === null) return;
    setEditingSlotIdx(null);

    try {
      const response = await fetch("/api/customer/update-stamp-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: activeCustomer.name,
          slotIndex: slotIdxZeroBased,
          newDate: tempDateVal.trim() || null,
          cardId: activeCard.id
        })
      });

      if (response.ok) {
        await fetchData();
        showMsg("스탬프 적립 일자가 성공적으로 업데이트되었습니다!");
      } else {
        const errJson = await response.json();
        showMsg(errJson.error || "일자 수정에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      showMsg("서버 통신 실패");
    }
  };

  // Toggle Benefit/Voucher Given/Used Check state
  const handleToggleVoucher = async (name: string, type: "postcard" | "freeShoot", isUsed: boolean) => {
    if (!activeCard) return;
    try {
      const response = await fetch(`/api/customer/${encodeURIComponent(name)}/toggle-voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          voucherType: type, 
          cardId: activeCard.id,
          isUsed
        })
      });

      if (response.ok) {
        await fetchData();
        const label = type === "postcard" ? "'엽서 사이즈 2장 인화'" : "'촬영 1회 무료 상품'";
        showMsg(`${label} 혜택이 ${isUsed ? "지급 완료" : "지급 대기"} 상태로 설정되었습니다.`, "success");
      } else {
        const errObj = await response.json();
        showMsg(errObj.error || "혜택 체크 업데이트 도중 오류가 발생했습니다.");
      }
    } catch (e) {
      console.error(e);
      showMsg("서버 통신 실패");
    }
  };

  // Delete customer and their coupon cards
  const handleDeleteCustomer = async (id: string, name: string) => {
    setConfirmModal({
      title: "⚠️ 회원 정보 영구 삭제 원격 승인",
      message: `정말로 '${name}' 고객의 정보 및 보유하고 계신 전체 스탬프/쿠폰 적립 이력 로그를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      confirmText: "영구 삭제 승인",
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const response = await fetch(`/api/customer/${id}`, {
            method: "DELETE"
          });

          if (response.ok) {
            const data = await response.json();
            showMsg(data.message || `'${name}' 고객이 성공적으로 삭제되었습니다.`, "success");
            
            // Refresh customer list first to maintain perfect sync
            const custRes = await fetch("/api/customers");
            if (custRes.ok) {
              const custData = await custRes.json();
              setCustomers(custData);
              
              // Select the first customer of the remaining list if deleted was selected
              const remaining = custData.filter((c: any) => c.id !== id);
              if (selectedCustomerId === id) {
                if (remaining.length > 0) {
                  setSelectedCustomerId(remaining[0].id);
                } else {
                  setSelectedCustomerId("");
                }
              }
            }
          } else {
            const errObj = await response.json().catch(() => ({ error: "알 수 없는 에러" }));
            showMsg(errObj.error || "삭제에 실패했습니다.");
          }
        } catch (err) {
          console.error(err);
          showMsg("서버 삭제 통신 실패");
        }
      }
    });
  };

  // Filter customers with search name
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="bg-stone-100 text-stone-900 min-h-screen flex flex-col font-sans selection:bg-rose-100 antialiased">
      
      {/* EXTREMELY POLISHED MASTER HEADER -- NO TELEMETRY AND SLOP */}
      <header className="bg-white border-b border-stone-200 px-6 py-5 flex flex-col sm:flex-row justify-between items-center shrink-0 shadow-xs gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white font-serif italic text-lg shadow-sm">
            L
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-stone-900 leading-none">Studio LENS</h1>
              <span className="bg-rose-50 border border-rose-200 text-rose-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                1인 전용 스탬프 쿠폰
              </span>
            </div>
            <p className="text-[10px] tracking-wider text-stone-400 mt-1 uppercase font-mono">Owner's Smart Checking Desk</p>
          </div>
        </div>

        {/* Info header for single owner checking convenience */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-stone-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            개인쿠폰 관리실 가동중
          </span>
          <span className="text-stone-300">|</span>
          <span className="font-semibold text-stone-700">관리자 계정: ( snapanda72 )</span>
        </div>
      </header>

      {/* SYSTEM FEEDBACK TOAST BANNER */}
      <AnimatePresence>
        {systemMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`px-6 py-3 border-b text-xs flex justify-between items-center font-medium ${
              systemMessage.type === "info" 
                ? "bg-stone-800 border-stone-900 text-white"
                : "bg-emerald-50 border-emerald-100 text-emerald-800"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>{systemMessage.text}</span>
            </div>
            <button onClick={() => setSystemMessage(null)} className="opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN WORKSPACE split sidebar/detail */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* ================== LEFT SIDEBAR: CUSTOMERS RAIL ================== */}
        <aside className="w-full md:w-80 lg:w-96 border-r border-stone-200 bg-stone-50/50 flex flex-col shrink-0 overflow-y-auto">
          
          {/* Quick Toolbar */}
          <div className="p-4 border-b border-stone-200 bg-white space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">1. 회원 정보 검색</span>
              <button 
                id="btn-add-customer-toggle"
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-0.5"
              >
                {showAddForm ? "닫기" : "새로 추가 +"}
              </button>
            </div>

            {/* Quick Create Form */}
            {showAddForm && (
              <form onSubmit={handleAddNewCustomer} className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                <p className="text-[10px] text-stone-500 font-semibold">새로운 고객을 도장 쿠폰에 기록합니다.</p>
                <div className="flex gap-1.5">
                  <input 
                    type="text" 
                    placeholder="고객명 (예: 임수진)" 
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    required
                    className="flex-1 bg-white border border-stone-200 text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-stone-500"
                  />
                  <button 
                    id="btn-add-customer-confirm"
                    type="submit"
                    className="p-1 px-3 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 transition-all font-sans"
                  >
                    확인
                  </button>
                </div>
              </form>
            )}

            {/* Search inputs */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-stone-400" />
              <input 
                type="text"
                placeholder="고객 이름으로 쿠폰 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-100 text-xs border border-stone-200 rounded-xl pl-9 pr-3 py-2 outline-none focus:bg-white focus:ring-1 focus:ring-stone-400 transition-all font-medium"
              />
            </div>
          </div>

          {/* Customer profile scroll list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-10 bg-white border border-dashed border-stone-200 rounded-2xl p-4">
                <p className="text-xs text-stone-400 font-medium">검색 결과 또는 저장된 회원이 없습니다.</p>
                <button 
                  onClick={() => { setShowAddForm(true); setSearchQuery(""); }}
                  className="mt-2 text-[11px] font-bold text-rose-600 hover:underline"
                >
                  새로운 고객 첫 등록하기
                </button>
              </div>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = activeCustomer?.id === cust.id;
                const totalCardsCount = cust.cards?.length || 1;
                
                return (
                  <div 
                    key={cust.id}
                    onClick={() => setSelectedCustomerId(cust.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group flex items-center justify-between ${
                      isSelected 
                        ? "bg-white border-stone-900 shadow-sm ring-1 ring-stone-900" 
                        : "bg-white border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Round user icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                        isSelected ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                      }`}>
                        {cust.name[0]}
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-stone-900">{cust.name}</h4>
                        </div>
                        <p className="text-[10px] text-stone-400 font-mono">ID: {cust.id.split('-')[1] || "NEW"}</p>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1">
                      <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 border border-rose-100/30 px-2 py-0.5 rounded-full">
                        {totalCardsCount > 1 ? `쿠폰 ${totalCardsCount}장째 (${cust.stamps}/8)` : `${cust.stamps} / 8 EA`}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button
                          title={`${cust.name} 고객 정보 삭제`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomer(cust.id, cust.name);
                          }}
                          className="text-stone-300 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-all md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Backoffice summary footer inside list */}
          <div className="p-4 border-t border-stone-200 bg-white text-[10px] text-stone-400 font-medium space-y-1">
            <p>• 쿠폰 관리 명단: {customers.length}명</p>
          </div>
        </aside>

        {/* ================== RIGHT WORKSPACE: ACTIVE STAMP CARD DESK ================== */}
        <main className="flex-1 bg-stone-100/40 p-4 md:p-8 overflow-y-auto flex flex-col items-center justify-start gap-8">
          {activeCustomer ? (
            <div className="w-full max-w-2xl space-y-8">
              
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-200 pb-4 gap-2">
                <div>
                  <h2 className="text-lg font-bold text-stone-900 flex items-center gap-1.5">
                    <span>{activeCustomer.name} 고객님의 적립 카드판</span>
                    <span className="font-mono text-xs text-stone-400 font-normal">({activeCard?.stamps || 0}/8)</span>
                  </h2>
                  <p className="text-xs text-stone-500">도장판의 원형 칸을 마우스로 클릭하면 도장이 표시되며, 도장 밑 날짜를 클릭하여 원하시는 날짜로 직접 수정할 수 있습니다.</p>
                </div>

                {/* Direct quick modify panel keys */}
                <div className="flex flex-wrap gap-2 items-center justify-end">
                  <div className="flex gap-1 bg-white p-1 rounded-lg border border-stone-200 shadow-xs text-stone-700">
                    <button 
                      id="btn-stamp-decrease"
                      title="1칸 취소"
                      onClick={() => handleStampChange(activeCustomer.name, 1, "remove")}
                      className="p-1 px-2 hover:bg-stone-50 text-stone-600 rounded transition-colors flex items-center gap-0.5 text-xs font-bold cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      1칸 회수
                    </button>
                    <span className="w-[1.5px] bg-stone-200" />
                    <button 
                      id="btn-stamp-increase"
                      title="1칸 직접적립"
                      onClick={() => handleStampChange(activeCustomer.name, 1, "add")}
                      className="p-1 px-2 hover:bg-stone-50 text-rose-600 rounded transition-colors flex items-center gap-0.5 text-xs font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      1칸 도장
                    </button>
                  </div>

                  <button 
                    id="btn-delete-customer"
                    title="고객 정보 영구 삭제"
                    onClick={() => handleDeleteCustomer(activeCustomer.id, activeCustomer.name)}
                    className="p-1.5 px-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-600 transition-all flex items-center gap-1 text-xs font-bold font-sans cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    고객 삭제
                  </button>
                </div>
              </div>

              {/* COUPON SHEET PAGER TABS (SHOWN ALWAYS FOR EASY NAVIGATION) */}
              <div className="flex flex-col gap-2 bg-white p-4 border border-stone-200 rounded-2xl shadow-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
                    • 고객관리 ({customerCards.length}개 보유)
                  </span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                    도장이 8개 초과하여 차면 새 쿠폰이 자동 발급됩니다 🎁
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap mt-1">
                  {customerCards.map((card, idx) => {
                    const isSelected = activeCard?.id === card.id;
                    const isLast = idx === customerCards.length - 1;
                    return (
                      <button
                        key={card.id}
                        onClick={() => setActiveCardId(card.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border outline-none ${
                          isSelected
                            ? "bg-rose-600 border-rose-600 text-white shadow-xs scale-105"
                            : "bg-[#FAFAFA] border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        {idx + 1}번 쿠폰 ({card.stamps}/8)
                        {isLast && card.stamps < 8 ? " ✏️" : ""}
                        {card.stamps === 8 && " ✅ 달성"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 🎁 BENEFIT CHECKLIST FOR REDEEM TRACKING */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-stone-400" />
                    실시간 쿠폰 혜택 지급 여부 체크
                  </h4>
                  <span className="text-[10px] font-mono font-medium text-stone-400">
                    선택된 쿠폰: {activeCard ? customerCards.indexOf(activeCard) + 1 : 1}번 고유식별판
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* 4 Stamps: Postcard */}
                  <label className={`flex items-center gap-3.5 p-4 rounded-xl border transition-all cursor-pointer ${
                    activeCard?.postcardUsed
                      ? "bg-stone-50 border-stone-200 opacity-80"
                      : activeCard && activeCard.stamps >= 4
                        ? "bg-[#F0FDF4] border-emerald-200 ring-1 ring-emerald-100"
                        : "bg-stone-50/50 border-stone-100 opacity-60"
                  }`}>
                    <input
                      type="checkbox"
                      checked={!!activeCard?.postcardUsed}
                      onChange={(e) => {
                        if (!activeCard) return;
                        handleToggleVoucher(activeCustomer.name, "postcard", e.target.checked);
                      }}
                      className="w-4 h-4 rounded text-stone-900 border-stone-300 focus:ring-stone-500 accent-stone-900 cursor-pointer"
                    />
                    <div className="space-y-0.5 select-none flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono font-extrabold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                          4칸 도장
                        </span>
                        <span className="text-xs font-bold text-stone-800">엽서 사이즈 2장 인화</span>
                      </div>
                      <p className="text-[10px] text-stone-500 font-medium">
                        {activeCard && activeCard.stamps >= 4 
                          ? (activeCard.postcardUsed ? "✅ 사은품 지급완료" : "✨ 지급 가능 (체크하여 완료)") 
                          : `🔒 미달성 (달성까지 ${activeCard ? 4 - activeCard.stamps : 4}칸 남음)`}
                      </p>
                    </div>
                  </label>

                  {/* 8 Stamps: Free Shoot */}
                  <label className={`flex items-center gap-3.5 p-4 rounded-xl border transition-all cursor-pointer ${
                    activeCard?.freeShootUsed
                      ? "bg-stone-50 border-stone-200 opacity-80"
                      : activeCard && activeCard.stamps >= 8
                        ? "bg-rose-50/50 border-rose-200 ring-1 ring-rose-100"
                        : "bg-stone-50/50 border-stone-100 opacity-60"
                  }`}>
                    <input
                      type="checkbox"
                      checked={!!activeCard?.freeShootUsed}
                      onChange={(e) => {
                        if (!activeCard) return;
                        handleToggleVoucher(activeCustomer.name, "freeShoot", e.target.checked);
                      }}
                      className="w-4 h-4 rounded text-stone-900 border-stone-300 focus:ring-stone-500 accent-stone-900 cursor-pointer"
                    />
                    <div className="space-y-0.5 select-none flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-mono font-extrabold uppercase bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                          8칸 도장
                        </span>
                        <span className="text-xs font-bold text-stone-800">촬영 1회 무료 상품</span>
                      </div>
                      <p className="text-[10px] text-stone-500 font-medium">
                        {activeCard && activeCard.stamps >= 8 
                          ? (activeCard.freeShootUsed ? "✅ 사은품 지급완료" : "✨ 지급 가능 (체크하여 완료)") 
                          : `🔒 미달성 (달성까지 ${activeCard ? 8 - activeCard.stamps : 8}칸 남음)`}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* ================== HIGH FIDELITY REPLICA CARD GRAPHIC FROM PHOTO ================== */}
              <div className="flex justify-center">
                <div 
                  id="physical-designed-coupon-replica"
                  className="w-full max-w-xl bg-white rounded-[32px] border-8 border-[#E2E2E2] p-5 sm:p-7 md:p-8 flex flex-col justify-between shadow-lg select-none relative min-h-[300px] sm:min-h-[370px] md:min-h-[400px] py-6"
                >
                  {/* Stamp Card Header texts Centered */}
                  <div className="text-center space-y-1">
                    <h3 className="text-stone-800 font-extrabold text-[15px] sm:text-[18px] md:text-[21px] tracking-tight leading-snug">
                      4칸을 채우시면 엽서사이즈 2장 인화
                    </h3>
                    <h3 className="text-stone-800 font-extrabold text-[15px] sm:text-[18px] md:text-[21px] tracking-tight leading-snug">
                      8칸을 채우시면 촬영 1회 무료
                    </h3>
                  </div>

                  {/* 4x2 grid with circles & date underneath */}
                  <div className="grid grid-cols-4 gap-x-4 gap-y-5 sm:gap-y-6 md:gap-y-7 px-2 sm:px-6 my-auto justify-items-center">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((slotIdx) => {
                      const isStamped = activeCard ? (activeCard.stamps >= slotIdx) : false;
                      const stampDate = activeCard ? (activeCard.stampDates?.[slotIdx - 1] || "") : "";
                      
                      return (
                        <div key={slotIdx} className="flex flex-col items-center gap-1 sm:gap-1.5">
                          <div
                            onClick={() => handleCircleSlotClick(slotIdx)}
                            className={`w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 relative group overflow-hidden ${
                              isStamped 
                                ? "bg-stone-50 border-2 border-stone-800 shadow-md transform hover:scale-105 active:scale-95" 
                                : "bg-[#C2C2C2] hover:bg-stone-400"
                            }`}
                            title={`#${slotIdx} 스탬프 활성화/해제`}
                          >
                            {isStamped ? (
                              <span className="text-xl sm:text-2xl md:text-3xl filter grayscale select-none">📷</span>
                            ) : (
                              <span className="text-xs font-mono font-bold text-white/60 group-hover:text-white select-none">
                                {slotIdx}
                              </span>
                            )}
                          </div>

                          {/* Individual Coupon Date underneath */}
                          <div className="h-4 flex items-center justify-center min-w-[65px]">
                            {isStamped ? (
                              editingSlotIdx === slotIdx - 1 ? (
                                <input
                                  type="text"
                                  value={tempDateVal}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTempDateVal(e.target.value)}
                                  onBlur={() => handleSaveStampDate(slotIdx - 1)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveStampDate(slotIdx - 1);
                                  }}
                                  autoFocus
                                  className="w-16 bg-stone-50 border border-stone-300 rounded text-[9px] font-mono text-center outline-none p-0.5 text-stone-800 focus:border-stone-600"
                                />
                              ) : (
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSlotIdx(slotIdx - 1);
                                    setTempDateVal(stampDate || "");
                                  }}
                                  className="text-[9px] sm:text-[10px] font-mono font-bold text-stone-500 hover:text-stone-900 cursor-pointer underline decoration-dotted whitespace-nowrap bg-stone-50 px-1 py-0.5 rounded border border-stone-100"
                                  title="클릭하여 일자 직접 수정"
                                >
                                  {stampDate || "날짜 기록"}
                                </span>
                              )
                            ) : (
                              <span className="text-[9px] font-mono text-stone-300 select-none">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Dark capsule Pill exact representation */}
                  <div className="flex justify-between items-center px-1 sm:px-4 mt-2 w-full">
                    <span className="text-[10px] font-mono font-bold text-stone-400 tracking-wider">
                      쿠폰색인: {activeCard ? customerCards.indexOf(activeCard) + 1 : 1} / {customerCards.length}
                    </span>
                    <div className="bg-[#5E5E5E] text-white py-1.5 px-4 sm:px-6 rounded-full font-bold text-[11px] sm:text-xs tracking-tight inline-flex items-center shadow-xs">
                      고객명 : {activeCustomer.name}
                    </div>
                  </div>
                </div>
              </div>



              {/* TIMELINE OF RECENT TRANSACTIONS LEDGER */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3.5">
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-stone-500" />
                    회원 수동 조정 및 적립 이력 로그 쿠폰
                  </h4>
                  <span className="text-[10px] font-mono text-stone-400">정렬기준: 최신순</span>
                </div>

                {activeCustomer.history && activeCustomer.history.length > 0 ? (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {activeCustomer.history.map((hObj) => (
                      <div key={hObj.id} className="p-3 bg-stone-50 rounded-xl text-xs flex justify-between items-center border border-stone-200/40">
                        <div className="space-y-0.5">
                          <p className="font-bold text-stone-800 leading-tight">{hObj.description}</p>
                          <p className="text-[9.5px] font-mono text-stone-400">{new Date(hObj.date).toLocaleString("ko-KR")}</p>
                        </div>

                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          hObj.amount > 0 ? "text-emerald-700 bg-emerald-50 border border-emerald-100" : "text-amber-800 bg-amber-50 border border-amber-100"
                        }`}>
                          {hObj.amount > 0 ? `+${hObj.amount}` : hObj.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-stone-400 border border-dashed border-stone-200 rounded-xl">
                    기록된 적립 또는 소모 통계 내역이 없습니다.
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="w-full max-w-xl text-center py-20 bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-3 flex flex-col items-center">
              <User className="w-12 h-12 text-stone-300 animate-pulse" />
              <h3 className="text-md font-bold text-stone-800">등록된 고객 없음</h3>
              <p className="text-xs text-stone-500">좌측 승인 명부나 검색창을 통해 회원을 선택해주시거나 신규로 등록해주십시오.</p>
            </div>
          )}
        </main>

      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t border-stone-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center text-[10px] text-stone-400 shrink-0 uppercase tracking-widest gap-2">
        <p>© 2026 Studio Lens Photography ledger. All rights reserved.</p>
        <p className="font-mono text-[9px]">designed for self-checking counter</p>
      </footer>

      {/* ⚠️ IFRAME COMPATIBLE CUSTOM MODAL POPUP */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-md w-full p-6 space-y-4 text-left"
            >
              <h3 className={`text-md font-bold ${confirmModal.isDanger ? 'text-red-600' : 'text-stone-900'}`}>
                {confirmModal.title}
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer ${
                    confirmModal.isDanger
                      ? "bg-red-600 hover:bg-red-700 font-sans"
                      : "bg-stone-900 hover:bg-stone-800 font-sans"
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
