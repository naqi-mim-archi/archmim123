import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Sparkles, Wand2, MessageSquare, Send, Bot, User, Loader2, Check, ArrowRight, Building, Map as MapIcon, TreeDeciduous, Waves, Settings2 } from 'lucide-react';
import { Project, ArchElement, Point } from '../types';
import { UrbanGeneratorService, UrbanPlanParams } from '../services/urbanService';

interface UrbanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (params: UrbanPlanParams) => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const UrbanWizard: React.FC<UrbanWizardProps> = ({ isOpen, onClose, onApply }) => {
  const [step, setStep] = useState<'chat' | 'parameters' | 'generating'>('chat');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [urbanParams, setUrbanParams] = useState<UrbanPlanParams | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const urbanService = new UrbanGeneratorService();

  useEffect(() => {
    if (isOpen && chatHistory.length === 0) {
      setChatHistory([{ 
        role: 'model', 
        text: "Welcome to the Urban Masterplan Wizard. Describe the vision for your site. For example: 'A high-density mixed-use district with a central park and waterfront towers.'" 
      }]);
    }
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    const newHistory = [...chatHistory, { role: 'user' as const, text: userInput }];
    setChatHistory(newHistory);
    setUserInput('');
    setIsTyping(true);

    try {
      // For urban, we analyze the prompt directly when it feels "ready" 
      // or we can just have a dedicated "Analyze" button. 
      // Let's provide a "Generate Brief" button once there is enough context.
      setChatHistory(prev => [...prev, { 
        role: 'model', 
        text: "That helps. I can now derive the planning parameters for this vision. Would you like to proceed or add more details?" 
      }]);
      setIsTyping(false);
    } catch (err) {
      console.error(err);
      setIsTyping(false);
    }
  };

  const handleApplyBrief = async () => {
    setStep('generating');
    try {
      const fullPrompt = chatHistory.map(m => `${m.role}: ${m.text}`).join('\n');
      const params = await urbanService.analyzePrompt(fullPrompt);
      setUrbanParams(params);
      setStep('parameters');
    } catch (err) {
      console.error(err);
      setStep('chat');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[101] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-3 text-blue-600">
            <div className="p-2 bg-blue-50 rounded-xl">
              <Sparkles size={24} />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-900">Masterplan Copilot</h2>
              <p className="text-xs text-slate-500 font-medium tracking-wide border-l-2 border-blue-200 pl-2 mt-1">URBAN SCALE AI</p>
            </div>
          </div>
          
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
          
          {step === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-4 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-blue-600 border border-slate-100'}`}>
                        {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                      </div>
                      <div className={`p-4 rounded-2xl text-base leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl px-6 py-3 text-sm text-slate-400 animate-pulse flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" /> Thinking...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 bg-white border-t border-slate-200 shrink-0 space-y-4">
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={userInput} 
                    onChange={(e) => setUserInput(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                    placeholder="Describe your design intent..." 
                    className="flex-1 px-6 py-4 bg-slate-50 text-slate-900 placeholder:text-slate-400 border-2 border-transparent rounded-2xl focus:border-blue-500 focus:bg-white outline-none text-base transition-all"
                    autoFocus 
                  />
                  <button 
                    onClick={handleSendMessage} 
                    disabled={!userInput.trim() || isTyping} 
                    className="px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-blue-200 flex items-center gap-2 font-bold"
                  >
                    <Send size={20} />
                  </button>
                </div>
                
                {chatHistory.length >= 2 && (
                  <button 
                    onClick={handleApplyBrief}
                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 border shadow-xl shadow-slate-200"
                  >
                    <Wand2 size={22} className="text-blue-400" />
                    Generate Planning Brief
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-in fade-in">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
                <div className="p-8 bg-white rounded-full shadow-2xl relative z-10">
                  <Loader2 size={64} className="text-blue-600 animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-3">
                <h3 className="font-bold text-slate-900 text-2xl tracking-tight">AI Planning Review</h3>
                <p className="text-slate-500 text-lg max-w-sm mx-auto font-medium">Extracting density requirements and program distribution from your brief.</p>
              </div>
            </div>
          )}

          {step === 'parameters' && urbanParams && (
            <div className="flex-1 overflow-y-auto p-10 animate-in slide-in-from-bottom-6 duration-500">
              <div className="max-w-3xl mx-auto space-y-10">
                <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
                  <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                    <Settings2 size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Derived Planning Brief</h3>
                    <p className="text-slate-500 font-medium">{urbanParams.planningGoal}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Density & Height */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 text-slate-400 font-bold text-xs uppercase tracking-widest">
                      <Building size={16} /> 
                      Density & Massing
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-sm text-slate-500 font-medium">Density Level</p>
                        <p className="text-2xl font-bold text-slate-900 capitalize">{urbanParams.densityLevel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500 font-medium">Strategy</p>
                        <p className="text-lg font-bold text-slate-700 capitalize">{urbanParams.heightStrategy.replace('-', ' ')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Street Pattern */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                    <div className="flex items-center gap-3 text-slate-400 font-bold text-xs uppercase tracking-widest">
                      <MapIcon size={16} /> 
                      Urban Connectivity
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 font-medium">Street Network</p>
                      <p className="text-2xl font-bold text-slate-900 capitalize">{urbanParams.streetPattern}</p>
                    </div>
                  </div>
                </div>

                {/* Program Mix */}
                <div className="bg-white p-8 rounded-4xl border border-slate-100 shadow-sm space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-400 font-bold text-xs uppercase tracking-widest">
                      <Sparkles size={16} /> 
                      Program Mix
                    </div>
                    <span className="text-xs px-2 py-1 bg-slate-100 rounded-md font-bold text-slate-500">100% Total</span>
                  </div>
                  
                  <div className="space-y-4">
                    {Object.entries(urbanParams.programDistribution).map(([key, val]) => (
                      <div key={key} className="space-y-1.5">
                        <div className="flex justify-between text-sm font-bold">
                          <span className="capitalize text-slate-700">{key}</span>
                          <span className="text-blue-600">{val}%</span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              key === 'residential' ? 'bg-slate-800' :
                              key === 'office' ? 'bg-blue-500' :
                              key === 'retail' ? 'bg-pink-500' :
                              key === 'park' ? 'bg-green-500' : 'bg-slate-400'
                            }`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Public Realm */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-green-50 p-6 rounded-3xl border border-green-100 space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-bold text-xs uppercase tracking-widest">
                      <TreeDeciduous size={16} /> Green Space
                    </div>
                    <p className="text-3xl font-extrabold text-green-800">{urbanParams.greenSpacePercent}%</p>
                  </div>
                  <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-2">
                    <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-widest">
                      <Waves size={16} /> Public Space
                    </div>
                    <p className="text-sm font-medium text-blue-800 leading-snug">{urbanParams.publicSpaceStrategy}</p>
                  </div>
                </div>

                <div className="pt-6 pb-12 flex gap-4">
                  <button 
                    onClick={() => setStep('chat')}
                    className="flex-1 py-5 bg-white border border-slate-200 text-slate-600 font-bold rounded-3xl hover:bg-slate-50 transition-all"
                  >
                    Refine Brief
                  </button>
                  <button 
                    onClick={() => onApply(urbanParams)}
                    className="flex-[2] py-5 bg-blue-600 text-white font-bold rounded-3xl hover:bg-blue-700 shadow-2xl shadow-blue-200 transition-all flex items-center justify-center gap-3 text-lg"
                  >
                    Generate Masterplan <ArrowRight size={20} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UrbanWizard;
