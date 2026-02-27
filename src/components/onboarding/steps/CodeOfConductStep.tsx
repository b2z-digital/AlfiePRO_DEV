import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, FileText, Eye, EyeOff } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';

interface CodeOfConductStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

export const CodeOfConductStep: React.FC<CodeOfConductStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const [accepted, setAccepted] = useState(formData.codeOfConductAccepted || false);
  const [codeOfConduct, setCodeOfConduct] = useState('');
  const [isHtmlContent, setIsHtmlContent] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchCodeOfConduct();
  }, [formData.clubId]);

  const fetchCodeOfConduct = async () => {
    if (!formData.clubId) return;

    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('code_of_conduct')
        .eq('id', formData.clubId)
        .single();

      if (error) throw error;

      const conduct = data?.code_of_conduct || getDefaultCodeOfConduct();

      // Check if content contains HTML tags
      const hasHtml = conduct.includes('<') && conduct.includes('>');
      setIsHtmlContent(hasHtml);
      setCodeOfConduct(conduct);
    } catch (error) {
      console.error('Error fetching code of conduct:', error);
      const defaultConduct = getDefaultCodeOfConduct();
      setIsHtmlContent(false);
      setCodeOfConduct(defaultConduct);
    }
  };

  const getDefaultCodeOfConduct = () => {
    return `# Club Code of Conduct

## Respect and Safety
- Treat all members, guests, and staff with respect and courtesy
- No harassment, discrimination, or bullying of any kind
- Sailing safety is paramount - follow all safety guidelines

## Club Facilities
- Respect club property and equipment
- Leave facilities clean and tidy after use
- Report any damage or safety concerns immediately

## On the Water
- Follow racing rules and sailing regulations
- Respect other water users and the environment
- Assist other sailors in distress when safe to do so

## Sportsmanship
- Demonstrate good sportsmanship at all times
- Accept race committee decisions gracefully
- Support and encourage fellow sailors

## Compliance
- Follow all club rules and regulations
- Comply with race official instructions
- Maintain valid membership and insurance

Failure to comply with this Code of Conduct may result in disciplinary action, including suspension or termination of membership.`;
  };

  const handleContinue = () => {
    if (!accepted) {
      alert('Please accept the Code of Conduct to continue');
      return;
    }

    onNext({
      codeOfConductAccepted: accepted,
    });
  };

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-6 sm:p-8 md:p-12">
      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
          <FileText className="text-purple-500 w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <h2 className={`text-xl sm:text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Code of Conduct
        </h2>
      </div>
      <p className={`mb-4 sm:mb-6 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        Please review and accept the club's code of conduct
      </p>

        <div
          className={`rounded-xl border transition-all ${
            darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
          } ${expanded ? 'h-[500px] sm:h-[600px]' : 'h-[300px] sm:h-[400px]'}`}
        >
          <div className="p-4 sm:p-5 md:p-6 overflow-y-auto h-[calc(100%-44px)] sm:h-[calc(100%-52px)]">
            {isHtmlContent ? (
              <div
                className={`code-of-conduct-content text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                style={{
                  lineHeight: '1.6',
                }}
                dangerouslySetInnerHTML={{ __html: codeOfConduct }}
              />
            ) : (
              <div className="space-y-3">
                {codeOfConduct.split('\n').map((line, index) => {
                  if (line.startsWith('# ')) {
                    return (
                      <h1
                        key={index}
                        className={`text-sm font-semibold mt-3 first:mt-0 mb-1.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}
                      >
                        {line.substring(2)}
                      </h1>
                    );
                  }
                  if (line.startsWith('## ')) {
                    return (
                      <h2
                        key={index}
                        className={`text-xs font-medium mt-3 mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                      >
                        {line.substring(3)}
                      </h2>
                    );
                  }
                  if (line.startsWith('- ')) {
                    return (
                      <li
                        key={index}
                        className={`ml-3 mb-1 text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
                      >
                        {line.substring(2)}
                      </li>
                    );
                  }
                  if (line.trim() === '') {
                    return <div key={index} className="h-1.5" />;
                  }
                  return (
                    <p
                      key={index}
                      className={`mb-1.5 text-xs leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className={`w-full p-2 sm:p-3 border-t flex items-center justify-center gap-2 transition-colors text-xs sm:text-sm ${
              darkMode
                ? 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-700'
            }`}
          >
            {expanded ? (
              <>
                <EyeOff size={14} className="sm:w-4 sm:h-4" />
                Show Less
              </>
            ) : (
              <>
                <Eye size={14} className="sm:w-4 sm:h-4" />
                Show More
              </>
            )}
          </button>
        </div>

        <div className="mt-4 sm:mt-6">
          <label
            className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg cursor-pointer transition-all ${
              accepted
                ? darkMode
                  ? 'bg-green-500/10 border-2 border-green-500'
                  : 'bg-green-50 border-2 border-green-500'
                : darkMode
                ? 'bg-slate-800 border-2 border-slate-700 hover:border-slate-600'
                : 'bg-slate-50 border-2 border-slate-200 hover:border-slate-300'
            }`}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 sm:mt-1 w-4 h-4 sm:w-5 sm:h-5 rounded border-slate-300 text-blue-500 focus:ring-2 focus:ring-blue-500 flex-shrink-0"
            />
            <span className={`flex-1 text-sm sm:text-base ${accepted ? 'text-green-600 font-medium' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              I have read and agree to abide by the club's Code of Conduct
            </span>
          </label>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
          <button
            onClick={onBack}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            Back
          </button>

          <button
            onClick={handleContinue}
            disabled={!accepted}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-all text-sm sm:text-base ${
              accepted
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 shadow-lg'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
    </div>
  );
};
