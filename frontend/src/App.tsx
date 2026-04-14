import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, FileText, Wrench, ShoppingCart,
  BarChart2, Store, ChevronLeft, Menu, BookOpen, Search, Tag, MoreHorizontal
} from 'lucide-react';

import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SalePage } from './pages/SalePage';
import { RepairsPage } from './pages/RepairsPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { CatalogPage } from './pages/CatalogPage';
import { PriceLookupPage } from './pages/PriceLookupPage';
import { CustomLabelsPage } from './pages/CustomLabelsPage';
import { getDashboardStats } from './api/client';

interface NavBadge {
  repairs: number;
  orders: number;
}

// Primary items → shown in both sidebar and mobile bottom nav
const primaryNavItems = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, exact: true },
  { to: '/albaranes', label: 'Albaranes', icon: FileText },
  { to: '/consulta', label: 'Consulta', icon: Search },
  { to: '/reparaciones', label: 'Reparaciones', icon: Wrench, badge: 'repairs' as const },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, badge: 'orders' as const },
];

// Secondary items → sidebar only (desktop)
const secondaryNavItems = [
  { to: '/catalogo',  label: 'Catálogo',  icon: BookOpen },
  { to: '/analisis',  label: 'Análisis',  icon: BarChart2 },
  { to: '/venta',     label: 'Venta',     icon: Store },
  { to: '/etiquetas', label: 'Etiquetas', icon: Tag },
];

const navItems = [...primaryNavItems, ...secondaryNavItems];

function SidebarNavGroup({ items, badges, collapsed }: {
  items: typeof navItems;
  badges: NavBadge;
  collapsed: boolean;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, badge, exact }) => {
        const count = badge ? badges[badge as keyof NavBadge] : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <span className="sidebar-item-icon">
              <Icon size={18} />
              {count > 0 && <span className="sidebar-badge">{count > 99 ? '99+' : count}</span>}
            </span>
            {!collapsed && <span className="sidebar-item-label">{label}</span>}
          </NavLink>
        );
      })}
    </>
  );
}

function Sidebar({ badges, collapsed, onToggle }: { badges: NavBadge; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">CF</div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">Casa Fonso</span>
          </div>
        )}
        <button className="sidebar-collapse-btn" onClick={onToggle} title={collapsed ? 'Expandir' : 'Colapsar'}>
          {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Primary nav */}
      <nav className="sidebar-nav">
        <SidebarNavGroup items={primaryNavItems} badges={badges} collapsed={collapsed} />
      </nav>

      {/* Secondary nav */}
      <nav className="sidebar-nav sidebar-nav-secondary">
        {!collapsed && (
          <div className="sidebar-section-label">Herramientas</div>
        )}
        <SidebarNavGroup items={secondaryNavItems} badges={badges} collapsed={collapsed} />
      </nav>
    </aside>
  );
}

function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = navItems.find(n => n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to) && n.to !== '/');
  const isDoc = location.pathname.startsWith('/documento/') || location.pathname.startsWith('/pedidos/') || location.pathname.startsWith('/producto/');

  return (
    <header className="mobile-header">
      {isDoc ? (
        <button className="mobile-back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} /> Volver
        </button>
      ) : (
        <div className="sidebar-logo-icon" style={{ width: 28, height: 28, fontSize: 10 }}>CF</div>
      )}
      <span className="mobile-header-title">{current?.label ?? 'Casa Fonso'}</span>
      <div style={{ width: 28 }} />
    </header>
  );
}

function BottomNav({ badges }: { badges: NavBadge }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const isSecondaryActive = secondaryNavItems.some(
    n => location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  );

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div className="more-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Tools drawer */}
      <div className={`more-drawer${drawerOpen ? ' more-drawer-open' : ''}`}>
        <div className="more-drawer-handle" onClick={() => setDrawerOpen(false)} />
        <div className="more-drawer-title">Herramientas</div>
        <div className="more-drawer-grid">
          {secondaryNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `more-drawer-item${isActive ? ' active' : ''}`}
            >
              <Icon size={26} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {primaryNavItems.map(({ to, label, icon: Icon, badge, exact }) => {
          const count = badge ? badges[badge as keyof NavBadge] : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon size={22} />
                {count > 0 && (
                  <span className="bottom-badge">{count > 9 ? '9+' : count}</span>
                )}
              </span>
              <span>{label}</span>
            </NavLink>
          );
        })}
        {/* "More" button */}
        <button
          className={`bottom-nav-item${isSecondaryActive || drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(v => !v)}
        >
          <MoreHorizontal size={22} />
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}

function AppShell() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  const [badges, setBadges] = useState<NavBadge>({ repairs: 0, orders: 0 });

  // Load badge counts (pending repairs + pending orders)
  useEffect(() => {
    const load = () => {
      getDashboardStats().then(({ data }) => {
        setBadges({
          repairs: data.repairs.pending,
          orders: data.orders.pending,
        });
      }).catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar badges={badges} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="app-content">
        <MobileHeader />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/albaranes" element={<HomePage />} />
            <Route path="/documento/:id" element={<DocumentPage />} />
            <Route path="/producto/:id" element={<ProductInfoPage />} />
            <Route path="/analisis" element={<AnalyticsPage />} />
            <Route path="/venta" element={<SalePage />} />
            <Route path="/reparaciones" element={<RepairsPage />} />
            <Route path="/pedidos" element={<OrdersPage />} />
            <Route path="/pedidos/:id" element={<OrderDetailPage />} />
            <Route path="/catalogo" element={<CatalogPage />} />
            <Route path="/consulta" element={<PriceLookupPage />} />
            <Route path="/etiquetas" element={<CustomLabelsPage />} />
          </Routes>
        </main>
        <BottomNav badges={badges} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
