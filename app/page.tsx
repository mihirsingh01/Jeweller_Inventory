'use client'

import React, { useState, useEffect } from 'react';
import {
  getDashboard,
  listParties,
  listItems,
  listBankAccounts,
  listSales,
  listPurchases,
  listStaff,
  getReminderSettings,
  listAuditLog,
} from '@/lib/api/services';
import {
  DashboardStats,
  Party,
  Item,
  BankAccount,
  Sale,
  Purchase,
  User,
  ReminderSettings,
  AuditLogRow,
} from '@/lib/api/types';

import { StaffHome } from '@/components/StaffHome';
import { MyEntriesView } from '@/components/MyEntriesView';
import { OwnerDashboard } from '@/components/OwnerDashboard';
import { AllEntriesView } from '@/components/AllEntriesView';
import { PartiesView } from '@/components/PartiesView';
import { StockView } from '@/components/StockView';
import { CashBankView } from '@/components/CashBankView';
import { StaffManagementView } from '@/components/StaffManagementView';
import { RemindersView } from '@/components/RemindersView';
import { OrdersView } from '@/components/OrdersView';
import { AuditLogView } from '@/components/AuditLogView';

import { NewSaleModal } from '@/components/NewSaleModal';
import { NewPurchaseModal } from '@/components/NewPurchaseModal';
import { JobWorkModal } from '@/components/JobWorkModal';
import { VoucherModal } from '@/components/VoucherModal';

const OWNER_NAV = [
  ['Dashboard', '⌂'],
  ['Entries', '↗'],
  ['Orders', '📋'],
  ['Parties', '◉'],
  ['Stock', '◇'],
  ['Cash and Bank', '₹'],
  ['Staff', '♙'],
  ['Reminders', '▣'],
  ['Audit Log', '≡'],
];

const STAFF_NAV = [
  ['Home', '⌂'],
  ['My Entries', '↗'],
  ['Orders', '📋'],
  ['Reminders', '▣'],
];

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(true);
  const [role, setRole] = useState<'Owner' | 'Staff'>('Owner');
  const [active, setActive] = useState('Dashboard');
  const [language, setLanguage] = useState<'EN' | 'HI'>('EN');

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'sale' | 'purchase' | 'polish' | 'meena' | 'receipt' | 'payment' | null
  >(null);

  // App data state
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);

  const loadData = async () => {
    try {
      const [d, p, it, b, s, pur, st, r, al] = await Promise.all([
        getDashboard(),
        listParties(),
        listItems(),
        listBankAccounts(),
        listSales(),
        listPurchases(),
        listStaff(),
        getReminderSettings(),
        listAuditLog(),
      ]);
      setDashboardStats(d);
      setParties(p);
      setItems(it);
      setBankAccounts(b);
      setSales(s);
      setPurchases(pur);
      setStaffList(st);
      setReminderSettings(r);
      setAuditLogs(al);
    } catch (err) {
      console.error('Failed to load application data', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync default tab on role switch
  const handleRoleSwitch = (newRole: 'Owner' | 'Staff') => {
    setRole(newRole);
    setActive(newRole === 'Owner' ? 'Dashboard' : 'Home');
  };

  if (!loggedIn) {
    return (
      <Login
        onLogin={() => setLoggedIn(true)}
        language={language}
        setLanguage={setLanguage}
      />
    );
  }

  const visibleNav = role === 'Owner' ? OWNER_NAV : STAFF_NAV;

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <Brand />
        <div className="role-switch">
          <span>Viewing as</span>
          <button
            className={role === 'Owner' ? 'selected' : ''}
            onClick={() => handleRoleSwitch('Owner')}
          >
            Owner
          </button>
          <button
            className={role === 'Staff' ? 'selected' : ''}
            onClick={() => handleRoleSwitch('Staff')}
          >
            Staff
          </button>
        </div>

        <nav className="nav-list">
          {visibleNav.map(([label, icon]) => (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={active === label ? 'active' : ''}
            >
              <b>{icon}</b>
              {label}
            </button>
          ))}
        </nav>

        <button className="sign-out" onClick={() => setLoggedIn(false)}>
          ↪ <span>Sign out</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <h1>
              {role === 'Owner' ? 'Good morning, Mihir' : 'Good morning, Amit'}
            </h1>
          </div>
          <div className="profile">
            <div className="avatar" style={{ background: role === 'Owner' ? '#9B1C31' : '#B8893B' }}>
              {role === 'Owner' ? 'MS' : 'AV'}
            </div>
            <div>
              <strong>{role === 'Owner' ? 'Mihir Sharma' : 'Amit Verma'}</strong>
              <span>{role === 'Owner' ? 'Business Owner (Admin)' : 'Staff Member'}</span>
            </div>
          </div>
        </header>

        {/* Mobile Role Switcher Banner (Dev only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mobile-role">
            <span>Demo Role Preview:</span>
            <button onClick={() => handleRoleSwitch(role === 'Owner' ? 'Staff' : 'Owner')}>
              {role} · Switch Role ⇄
            </button>
          </div>
        )}

        {/* Screen Switcher */}
        <div style={{ marginTop: 24 }}>
          {/* STAFF SCREENS */}
          {role === 'Staff' && active === 'Home' && (
            <StaffHome
              staffName="Amit Verma"
              onOpenModal={(modal) => setActiveModal(modal)}
              entries={sales}
            />
          )}

          {role === 'Staff' && active === 'My Entries' && (
            <MyEntriesView
              entries={sales.filter((s) => s.created_by === 'u2' || !s.created_by)}
              onOpenSaleModal={() => setActiveModal('sale')}
            />
          )}

          {/* OWNER SCREENS */}
          {role === 'Owner' && active === 'Dashboard' && dashboardStats && (
            <OwnerDashboard
              stats={dashboardStats}
              onNavigate={(tab) => setActive(tab)}
              onOpenSaleModal={() => setActiveModal('sale')}
            />
          )}

          {role === 'Owner' && active === 'Entries' && (
            <AllEntriesView
              entries={sales}
              purchases={purchases}
              onRefresh={loadData}
              onOpenSaleModal={() => setActiveModal('sale')}
              onOpenPurchaseModal={() => setActiveModal('purchase')}
            />
          )}

          {role === 'Owner' && active === 'Parties' && (
            <PartiesView parties={parties} onRefresh={loadData} />
          )}

          {role === 'Owner' && active === 'Stock' && (
            <StockView items={items} onRefresh={loadData} />
          )}

          {role === 'Owner' && active === 'Cash and Bank' && (
            <CashBankView bankAccounts={bankAccounts} />
          )}

          {role === 'Owner' && active === 'Staff' && (
            <StaffManagementView staffList={staffList} onRefresh={loadData} />
          )}

          {active === 'Reminders' && reminderSettings && (
            <RemindersView
              settings={reminderSettings}
              parties={parties}
              role={role}
              onRefresh={loadData}
            />
          )}

          {active === 'Orders' && (
            <OrdersView
              parties={parties}
              items={items}
              role={role}
              onRefresh={loadData}
            />
          )}

          {role === 'Owner' && active === 'Audit Log' && (
            <AuditLogView logs={auditLogs} />
          )}
        </div>

        <p className="auto-note">
          Date and time are recorded automatically by the database server clock.
        </p>
      </main>

      {/* Mobile Bottom Tab Navigation */}
      <nav className="bottom-tabs">
        {visibleNav.slice(0, 4).map(([label, icon]) => (
          <button
            key={label}
            onClick={() => setActive(label)}
            className={active === label ? 'active' : ''}
          >
            <b>{icon}</b>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Transaction Entry Modals */}
      <NewSaleModal
        isOpen={activeModal === 'sale'}
        onClose={() => setActiveModal(null)}
        parties={parties}
        items={items}
        onSaleCreated={loadData}
      />

      <NewPurchaseModal
        isOpen={activeModal === 'purchase'}
        onClose={() => setActiveModal(null)}
        parties={parties}
        items={items}
        onPurchaseCreated={loadData}
      />

      <JobWorkModal
        isOpen={activeModal === 'polish'}
        type="POLISH"
        onClose={() => setActiveModal(null)}
        parties={parties}
        items={items}
        onJobWorkCreated={loadData}
      />

      <JobWorkModal
        isOpen={activeModal === 'meena'}
        type="MEENA"
        onClose={() => setActiveModal(null)}
        parties={parties}
        items={items}
        onJobWorkCreated={loadData}
      />

      <VoucherModal
        isOpen={activeModal === 'receipt'}
        kind="RECEIPT"
        onClose={() => setActiveModal(null)}
        parties={parties}
        bankAccounts={bankAccounts}
        onVoucherCreated={loadData}
      />

      <VoucherModal
        isOpen={activeModal === 'payment'}
        kind="PAYMENT"
        onClose={() => setActiveModal(null)}
        parties={parties}
        bankAccounts={bankAccounts}
        onVoucherCreated={loadData}
      />
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">K</div>
      <div>
        <strong>Kumkum Payal</strong>
        <span>Jewellery accounts</span>
      </div>
    </div>
  );
}

function Login({
  onLogin,
  language,
  setLanguage,
}: {
  onLogin: () => void;
  language: string;
  setLanguage: (v: 'EN' | 'HI') => void;
}) {
  return (
    <main className="login-page">
      <div className="login-card">
        <Brand />
        <div className="login-copy">
          <p className="eyebrow">Welcome back</p>
          <h1>
            Run your business
            <br />
            <em>with clarity.</em>
          </h1>
          <p>Simple accounts and inventory, made for jewellery traders.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          <label>
            Username
            <input required placeholder="Enter username" defaultValue="mihir" />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              placeholder="Enter password"
              defaultValue="password"
            />
          </label>
          <button className="primary-button" type="submit">
            Sign in <span>→</span>
          </button>
        </form>
        <div className="login-footer">
          <span>© 2026 Kumkum Payal</span>
          <div>
            <button
              className={language === 'EN' ? 'lang-active' : ''}
              onClick={() => setLanguage('EN')}
              type="button"
            >
              English
            </button>
            <span>/</span>
            <button
              className={language === 'HI' ? 'lang-active' : ''}
              onClick={() => setLanguage('HI')}
              type="button"
            >
              हिन्दी
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
