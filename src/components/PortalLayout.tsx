import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  Camera,
  ClipboardList,
  FileCheck2,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  Server,
  Settings,
  ShieldAlert,
  FileBarChart2,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LanguageSwitch, useLanguage } from '../context/LanguageContext';
import { MediTrustLogo } from './MediTrustLogo';
import type { PortalRole } from '../types';

export type PatientRoute =
  | 'dashboard'
  | 'scanner'
  | 'prescriptions'
  | 'documents'
  | 'assistant'
  | 'alerts'
  | 'settings';

export type PharmacistRoute =
  | 'dashboard'
  | 'inventory'
  | 'traceability'
  | 'review'
  | 'documents'
  | 'assistant'
  | 'reports'
  | 'admin';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

interface PortalLayoutProps {
  role: PortalRole;
  activePage: string;
  onNavigate: (page: string) => void;
  onSwitchPortal: (targetRole: PortalRole) => void;
  onGoHome: () => void;
  children: React.ReactNode;
}

export function PortalLayout({
  role,
  activePage,
  onNavigate,
  onSwitchPortal,
  onGoHome,
  children,
}: PortalLayoutProps) {
  const { profile, data, logout } = useAuth();
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const openAlertsCount = data.alerts.filter(
    (a) => a.portalRole === role && a.status !== 'resolved'
  ).length;
  const pendingReviewsCount = data.scans.filter(
    (s) => s.reviewStatus === 'pending_review' || s.reviewStatus === 'escalated'
  ).length;

  const navItems: NavItem[] =
    role === 'patient'
      ? [
          { id: 'dashboard', label: t('Patient Dashboard', 'रोगी डैशबोर्ड'), icon: LayoutDashboard },
          { id: 'scanner', label: t('AI Medicine Scanner', 'एआई दवा स्कैनर'), icon: Camera },
          { id: 'prescriptions', label: t('Prescription Tracker', 'पर्चा ट्रैकर'), icon: ClipboardList },
          { id: 'documents', label: t('Document Verification', 'दस्तावेज़ सत्यापन'), icon: FileCheck2 },
          { id: 'assistant', label: t('AI Safety Assistant', 'एआई सुरक्षा सहायक'), icon: MessageSquareText },
          {
            id: 'alerts',
            label: t('Safety & Recalls', 'सुरक्षा एवं रिकॉल'),
            icon: Bell,
            count: openAlertsCount,
          },
          { id: 'settings', label: t('History & Privacy', 'इतिहास एवं गोपनीयता'), icon: Settings },
        ]
      : [
          { id: 'dashboard', label: t('Pharmacy Dashboard', 'फार्मेसी डैशबोर्ड'), icon: LayoutDashboard },
          { id: 'inventory', label: t('Inventory & Ledger', 'इन्वेंट्री एवं लेजर'), icon: Package },
          { id: 'traceability', label: t('Batch Traceability', 'बैच ट्रेसेबिलिटी'), icon: GitBranch },
          {
            id: 'review',
            label: t('Verification Review', 'सत्यापन समीक्षा'),
            icon: ShieldAlert,
            count: pendingReviewsCount,
          },
          { id: 'documents', label: t('Invoice & Doc Verify', 'इनवॉइस एवं दस्तावेज़'), icon: FileCheck2 },
          { id: 'assistant', label: t('Pharmacy AI Copilot', 'फार्मेसी एआई सहायक'), icon: MessageSquareText },
          {
            id: 'reports',
            label: t('Alerts & Reports', 'अलर्ट एवं रिपोर्ट'),
            icon: FileBarChart2,
            count: openAlertsCount,
          },
          {
            id: 'admin',
            label: t('Admin & Connectors', 'एडमिन एवं कनेक्टर'),
            icon: Server,
          },
        ];

  const activeNav = navItems.find((item) => item.id === activePage) || navItems[0];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
        <button
          type="button"
          onClick={onGoHome}
          className="cursor-pointer focus-visible:outline-none"
          aria-label="MediTrust AI Home"
        >
          <MediTrustLogo size="md" variant="dark" />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-[#0B1B2B] cursor-pointer"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-4 border-b border-slate-200 bg-[#F8FAFC]">
        <p className="text-xs font-semibold text-[#0D7377]">
          {role === 'pharmacist'
            ? t('Pharmacist Workspace', 'फार्मासिस्ट कार्यक्षेत्र')
            : t('Patient Workspace', 'रोगी कार्यक्षेत्र')}
        </p>
        <p className="text-sm font-semibold text-[#0B1B2B] truncate mt-0.5">
          {role === 'pharmacist'
            ? profile?.pharmacyName || profile?.displayName
            : profile?.displayName}
        </p>
        {role === 'pharmacist' && profile?.licenseNumber && (
          <p className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
            {profile.licenseNumber}
          </p>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Portal Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activePage;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#0B1B2B] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B1B2B]'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-300' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    isActive ? 'text-teal-300' : 'text-rose-700 font-semibold'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-2">
        <div className="px-2 py-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-500">
            {t('Language', 'भाषा')}
          </span>
          <LanguageSwitch compact />
        </div>

        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            onSwitchPortal(role === 'patient' ? 'pharmacist' : 'patient');
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-[#0B1B2B] hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#0D7377] shrink-0" />
          <span>
            {role === 'patient'
              ? t('Switch to Pharmacist Portal', 'फार्मासिस्ट पोर्टल पर जाएँ')
              : t('Switch to Patient Portal', 'रोगी पोर्टल पर जाएँ')}
          </span>
        </button>

        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>{t('Sign Out', 'लॉग आउट')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
            />
            <motion.aside
              initial={{ x: -270 }}
              animate={{ x: 0 }}
              exit={{ x: -270 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 lg:hidden"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0B1B2B] cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                {role === 'pharmacist'
                  ? t('Pharmacist Portal', 'फार्मासिस्ट पोर्टल')
                  : t('Patient Portal', 'रोगी पोर्टल')}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-[#0B1B2B] truncate">
                {activeNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <LanguageSwitch compact />
            <span className="hidden xl:inline text-xs text-slate-500 truncate max-w-[180px]">
              {profile?.email}
            </span>
            {role === 'patient' ? (
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{t('Scan Medicine', 'दवा स्कैन करें')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-[#0D7377] rounded-lg hover:bg-[#0A5C5F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                <span>{t('Manage Stock', 'स्टॉक प्रबंधन')}</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1360px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${role}-${activePage}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
