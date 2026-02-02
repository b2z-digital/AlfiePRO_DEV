import React, { useState } from 'react';
import { Globe, Palette, Type, Image, Save, Layout, Check, X, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface WebsiteThemeProps {
  darkMode: boolean;
  onBack?: () => void;
}

interface ThemeSettings {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logo: string | null;
  favicon: string | null;
  headerContent: string;
  footerContent: string;
}

export const WebsiteTheme: React.FC<WebsiteThemeProps> = ({ darkMode, onBack }) => {
  const { currentClub } = useAuth();
  const [activeTab, setActiveTab] = useState<'colors' | 'typography' | 'layout'>('colors');
  const [theme, setTheme] = useState<ThemeSettings>({
    primaryColor: '#3b82f6',
    secondaryColor: '#6366f1',
    accentColor: '#10b981',
    backgroundColor: '#ffffff',
    textColor: '#1e293b',
    headingFont: 'Outfit',
    bodyFont: 'Inter',
    logo: currentClub?.club?.logo || null,
    favicon: null,
    headerContent: '<div class="text-center">Welcome to our club website</div>',
    footerContent: `<div class="text-center">© ${new Date().getFullYear()} ${currentClub?.club?.name || 'Your Club'}. All rights reserved.</div>`
  });

  const fontOptions = [
    { value: 'Outfit', label: 'Outfit' },
    { value: 'Inter', label: 'Inter' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Montserrat', label: 'Montserrat' },
    { value: 'Open Sans', label: 'Open Sans' },
    { value: 'Lato', label: 'Lato' },
    { value: 'Poppins', label: 'Poppins' },
    { value: 'Raleway', label: 'Raleway' }
  ];

  const handleColorChange = (key: keyof ThemeSettings, value: string) => {
    setTheme(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleFontChange = (key: keyof ThemeSettings, value: string) => {
    setTheme(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveTheme = () => {
    // Save theme logic would go here
    alert('Theme settings saved!');
  };

  const renderColorsTab = () => (
    <div className="space-y-6">
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Primary Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.primaryColor}
            onChange={(e) => handleColorChange('primaryColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={theme.primaryColor}
            onChange={(e) => handleColorChange('primaryColor', e.target.value)}
            className={`
              px-3 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-white border border-slate-600' 
                : 'bg-white text-slate-800 border border-slate-200'}
            `}
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Secondary Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.secondaryColor}
            onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={theme.secondaryColor}
            onChange={(e) => handleColorChange('secondaryColor', e.target.value)}
            className={`
              px-3 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-white border border-slate-600' 
                : 'bg-white text-slate-800 border border-slate-200'}
            `}
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Accent Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.accentColor}
            onChange={(e) => handleColorChange('accentColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={theme.accentColor}
            onChange={(e) => handleColorChange('accentColor', e.target.value)}
            className={`
              px-3 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-white border border-slate-600' 
                : 'bg-white text-slate-800 border border-slate-200'}
            `}
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Background Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.backgroundColor}
            onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={theme.backgroundColor}
            onChange={(e) => handleColorChange('backgroundColor', e.target.value)}
            className={`
              px-3 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-white border border-slate-600' 
                : 'bg-white text-slate-800 border border-slate-200'}
            `}
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Text Color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.textColor}
            onChange={(e) => handleColorChange('textColor', e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer"
          />
          <input
            type="text"
            value={theme.textColor}
            onChange={(e) => handleColorChange('textColor', e.target.value)}
            className={`
              px-3 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-white border border-slate-600' 
                : 'bg-white text-slate-800 border border-slate-200'}
            `}
          />
        </div>
      </div>
    </div>
  );

  const renderTypographyTab = () => (
    <div className="space-y-6">
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Heading Font
        </label>
        <select
          value={theme.headingFont}
          onChange={(e) => handleFontChange('headingFont', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg transition-colors
            ${darkMode 
              ? 'bg-slate-700 text-white border border-slate-600' 
              : 'bg-white text-slate-800 border border-slate-200'}
          `}
        >
          {fontOptions.map(font => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
        <div 
          className="mt-3 p-4 rounded-lg"
          style={{ 
            fontFamily: theme.headingFont,
            backgroundColor: darkMode ? '#1e293b' : '#f8fafc'
          }}
        >
          <h1 style={{ color: theme.primaryColor, fontSize: '2rem', marginBottom: '0.5rem' }}>
            Heading 1 Example
          </h1>
          <h2 style={{ color: theme.secondaryColor, fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Heading 2 Example
          </h2>
          <h3 style={{ color: theme.textColor, fontSize: '1.25rem' }}>
            Heading 3 Example
          </h3>
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Body Font
        </label>
        <select
          value={theme.bodyFont}
          onChange={(e) => handleFontChange('bodyFont', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg transition-colors
            ${darkMode 
              ? 'bg-slate-700 text-white border border-slate-600' 
              : 'bg-white text-slate-800 border border-slate-200'}
          `}
        >
          {fontOptions.map(font => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>
        <div 
          className="mt-3 p-4 rounded-lg"
          style={{ 
            fontFamily: theme.bodyFont,
            backgroundColor: darkMode ? '#1e293b' : '#f8fafc',
            color: theme.textColor
          }}
        >
          <p style={{ marginBottom: '1rem' }}>
            This is an example paragraph showing how your body text will look on your website. 
            The quick brown fox jumps over the lazy dog.
          </p>
          <p>
            <a href="#" style={{ color: theme.primaryColor }}>This is a link</a> within your content.
            You can see how it stands out from the regular text.
          </p>
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Logo
        </label>
        <div className="flex items-center gap-4 mb-4">
          {theme.logo ? (
            <img 
              src={theme.logo} 
              alt="Logo" 
              className="w-16 h-16 object-contain rounded-lg"
            />
          ) : (
            <div className={`
              w-16 h-16 flex items-center justify-center rounded-lg
              ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
            `}>
              <Image size={24} className="text-slate-400" />
            </div>
          )}
          <div>
            <button
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${darkMode 
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' 
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
              `}
            >
              Upload Logo
            </button>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Recommended size: 200x200px
            </p>
          </div>
        </div>
        
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Favicon
        </label>
        <div className="flex items-center gap-4">
          {theme.favicon ? (
            <img 
              src={theme.favicon} 
              alt="Favicon" 
              className="w-8 h-8 object-contain rounded-lg"
            />
          ) : (
            <div className={`
              w-8 h-8 flex items-center justify-center rounded-lg
              ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
            `}>
              <Image size={16} className="text-slate-400" />
            </div>
          )}
          <div>
            <button
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${darkMode 
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' 
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
              `}
            >
              Upload Favicon
            </button>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Recommended size: 32x32px
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLayoutTab = () => (
    <div className="space-y-6">
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Header Content
        </label>
        <textarea
          value={theme.headerContent}
          onChange={(e) => setTheme(prev => ({ ...prev, headerContent: e.target.value }))}
          rows={4}
          className={`
            w-full px-3 py-2 rounded-lg transition-colors
            ${darkMode 
              ? 'bg-slate-700 text-white border border-slate-600' 
              : 'bg-white text-slate-800 border border-slate-200'}
          `}
        />
        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          You can use HTML to customize your header content.
        </p>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Footer Content
        </label>
        <textarea
          value={theme.footerContent}
          onChange={(e) => setTheme(prev => ({ ...prev, footerContent: e.target.value }))}
          rows={4}
          className={`
            w-full px-3 py-2 rounded-lg transition-colors
            ${darkMode 
              ? 'bg-slate-700 text-white border border-slate-600' 
              : 'bg-white text-slate-800 border border-slate-200'}
          `}
        />
        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          You can use HTML to customize your footer content.
        </p>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Layout Preview
        </label>
        <div className={`
          border rounded-lg overflow-hidden
          ${darkMode ? 'border-slate-600' : 'border-slate-300'}
        `}>
          {/* Header */}
          <div style={{ 
            backgroundColor: theme.primaryColor,
            color: '#ffffff',
            padding: '1rem',
            fontFamily: theme.headingFont
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme.logo ? (
                  <img src={theme.logo} alt="Logo" className="w-8 h-8 object-contain" />
                ) : (
                  <div className="w-8 h-8 bg-white/20 rounded-full"></div>
                )}
                <span className="font-bold">{currentClub?.club?.name || 'Your Club'}</span>
              </div>
              <div className="flex gap-4">
                <span>Home</span>
                <span>About</span>
                <span>Events</span>
                <span>Contact</span>
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div style={{ 
            backgroundColor: theme.backgroundColor,
            color: theme.textColor,
            padding: '2rem',
            fontFamily: theme.bodyFont,
            minHeight: '200px'
          }}>
            <h1 style={{ 
              color: theme.primaryColor,
              fontFamily: theme.headingFont,
              marginBottom: '1rem',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}>
              Page Title
            </h1>
            <p>This is sample content to demonstrate your theme settings.</p>
            <button style={{
              backgroundColor: theme.secondaryColor,
              color: '#ffffff',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              marginTop: '1rem',
              fontFamily: theme.bodyFont
            }}>
              Sample Button
            </button>
          </div>
          
          {/* Footer */}
          <div style={{ 
            backgroundColor: theme.primaryColor,
            color: '#ffffff',
            padding: '1rem',
            fontFamily: theme.bodyFont,
            fontSize: '0.875rem',
            textAlign: 'center'
          }}>
            © {new Date().getFullYear()} {currentClub?.club?.name || 'Your Club'}. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Globe className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Customise Theme</h1>
              <p className="text-slate-400">
                Customise the look and feel of your website
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveTheme}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
          >
            <Save size={18} />
            Save Theme
          </button>
        </div>

        <div className={`
          rounded-xl border backdrop-blur-sm overflow-hidden
          ${darkMode 
            ? 'bg-slate-800/30 border-slate-700/50' 
            : 'bg-white/10 border-slate-200/20'}
        `}>
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('colors')}
              className={`
                flex-1 py-4 text-center transition-colors flex items-center justify-center gap-2
                ${activeTab === 'colors' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-slate-400 hover:text-slate-300'}
              `}
            >
              <Palette size={18} />
              <span>Colors</span>
            </button>
            <button
              onClick={() => setActiveTab('typography')}
              className={`
                flex-1 py-4 text-center transition-colors flex items-center justify-center gap-2
                ${activeTab === 'typography' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-slate-400 hover:text-slate-300'}
              `}
            >
              <Type size={18} />
              <span>Typography & Logo</span>
            </button>
            <button
              onClick={() => setActiveTab('layout')}
              className={`
                flex-1 py-4 text-center transition-colors flex items-center justify-center gap-2
                ${activeTab === 'layout' 
                  ? 'border-b-2 border-blue-500 text-blue-400' 
                  : 'text-slate-400 hover:text-slate-300'}
              `}
            >
              <Layout size={18} />
              <span>Layout</span>
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'colors' && renderColorsTab()}
            {activeTab === 'typography' && renderTypographyTab()}
            {activeTab === 'layout' && renderLayoutTab()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsiteTheme;