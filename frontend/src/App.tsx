import { BrowserRouter, Routes, Route, NavLink, Link, Navigate, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  LayoutDashboard, FileText, Wrench, ShoppingCart,
  BarChart2, ChevronLeft, Menu, BookOpen, Search, Tag, MoreHorizontal, PenLine, CalendarDays, SlidersHorizontal, ClipboardCheck, BookMarked, CalendarClock, Tablet
} from 'lucide-react';

// Siempre a mano (también sin cobertura en el reparto): Inicio, firmas y reparto
import { DashboardPage } from './pages/DashboardPage';
import { FirmasPage } from './pages/FirmasPage';
import { FirmaDetailPage } from './pages/FirmaDetailPage';
import { RepartoPage } from './pages/RepartoPage';
import { ArranquePegatina, debeArrancar } from './components/CabeceraPegatina';
import { isReparto } from './reparto';
import { Logo } from './components/Logo';
import { AccessGate } from './components/AccessGate';
import { Novedades, hayNovedades } from './components/Novedades';
import { Tutorial } from './components/Tutorial';
import { MenuCuenta } from './components/MenuCuenta';
import { NuevaVersion } from './components/NuevaVersion';
import { ErrorPantalla } from './components/ErrorPantalla';
import { useCfToast } from './components/CfToast';
import { arrancarCola } from './lib/offline';
import { arrancarColaCargas } from './lib/offlineCargas';
import { getRol } from './auth';
import { getDashboardStats, getFirmasStats, getCorreo } from './api/client';
import './pages/consulta.css';

/** Carga por partes: cada apartado se descarga al abrirlo. Si tras una actualización
 *  ya no existe la parte vieja, se recarga la app una vez para coger la nueva. */
function porPartes<T extends Record<string, unknown>, K extends keyof T>(cargar: () => Promise<T>, nombre: K) {
  return lazy(async () => {
    try {
      const m = await cargar();
      try { sessionStorage.removeItem('cfRecargaPartes'); } catch { /* nada */ }
      return { default: m[nombre] as ComponentType };
    } catch (err) {
      let ya = false;
      try { ya = sessionStorage.getItem('cfRecargaPartes') === '1'; sessionStorage.setItem('cfRecargaPartes', '1'); } catch { /* nada */ }
      if (!ya && navigator.onLine) { window.location.reload(); return new Promise<never>(() => {}); }
      throw err;
    }
  });
}
const HomePage = porPartes(() => import('./pages/HomePage'), 'HomePage');
const DocumentPage = porPartes(() => import('./pages/DocumentPage'), 'DocumentPage');
const AnalyticsPage = porPartes(() => import('./pages/AnalyticsPage'), 'AnalyticsPage');
const RepairsPage = porPartes(() => import('./pages/RepairsPage'), 'RepairsPage');
const RepairDetailPage = porPartes(() => import('./pages/RepairDetailPage'), 'RepairDetailPage');
const OrdersPage = porPartes(() => import('./pages/OrdersPage'), 'OrdersPage');
const OrderDetailPage = porPartes(() => import('./pages/OrderDetailPage'), 'OrderDetailPage');
const CatalogPage = porPartes(() => import('./pages/CatalogPage'), 'CatalogPage');
const PriceLookupPage = porPartes(() => import('./pages/PriceLookupPage'), 'PriceLookupPage');
const CustomLabelsPage = porPartes(() => import('./pages/CustomLabelsPage'), 'CustomLabelsPage');
const TurnosPage = porPartes(() => import('./pages/TurnosPage'), 'TurnosPage');
const AjustesPage = porPartes(() => import('./pages/AjustesPage'), 'AjustesPage');
const CargasPage = porPartes(() => import('./pages/CargasPage'), 'CargasPage');
const OrdenCargaPage = porPartes(() => import('./pages/CargasPage'), 'OrdenCargaPage');
const OrdenCargaReparto = porPartes(() => import('./pages/CargasPage'), 'OrdenCargaReparto');
const TarifasPage = porPartes(() => import('./pages/TarifasPage'), 'TarifasPage');
const VencimientosPage = porPartes(() => import('./pages/VencimientosPage'), 'VencimientosPage');
const TarifaProveedorPage = porPartes(() => import('./pages/TarifasPage'), 'TarifaProveedorPage');
const TarifaFamiliaPage = porPartes(() => import('./pages/TarifasPage'), 'TarifaFamiliaPage');
const TarifaFichaPage = porPartes(() => import('./pages/TarifasPage'), 'TarifaFichaPage');
const MostradorPage = porPartes(() => import('./pages/MostradorPage'), 'MostradorPage');
const ConsultaInicio = porPartes(() => import('./pages/ConsultaInicio'), 'ConsultaInicio');

/** Mientras llega un apartado: discreto (solo aparece si tarda). */
const Cargando = () => <div className="cf-suspense" role="status" aria-live="polite">Cargando…</div>;

interface NavBadge {
  repairs: number;
  orders: number;
  firmas: number;
  correo: number;
}

// Menú agrupado por áreas del negocio (igual para la tienda y el encargado)
type NavItem = { to: string; label: string; short?: string; icon: typeof FileText; badge?: keyof NavBadge; exact?: boolean; soloEncargado?: boolean };
const navGroups: { titulo: string; items: NavItem[] }[] = [
  { titulo: 'Clientes', items: [
    { to: '/firmas', label: 'Albaranes de venta', short: 'Ventas', icon: PenLine, badge: 'firmas' },
    { to: '/cargas', label: 'Órdenes de carga', short: 'Cargas', icon: ClipboardCheck },
    { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, badge: 'orders' },
    { to: '/reparaciones', label: 'Reparaciones', icon: Wrench, badge: 'repairs' },
  ] },
  { titulo: 'Mostrador', items: [
    { to: '/consulta', label: 'Consultar precio', short: 'Precios', icon: Search },
    { to: '/tarifas', label: 'Tarifas de proveedor', short: 'Tarifas', icon: BookMarked },
    { to: '/etiquetas', label: 'Etiquetas', icon: Tag },
  ] },
  { titulo: 'Proveedores', items: [
    { to: '/albaranes', label: 'Albaranes de compra', short: 'Compras', icon: FileText },
    { to: '/catalogo', label: 'Catálogo', icon: BookOpen },
    { to: '/analisis', label: 'Análisis de compras', icon: BarChart2 },
    { to: '/ajustes', label: 'Márgenes y precios', icon: SlidersHorizontal, soloEncargado: true },
  ] },
  { titulo: 'Equipo', items: [
    { to: '/turnos', label: 'Turnos', icon: CalendarDays },
  ] },
  // Lo que se está probando: solo lo ve el encargado
  { titulo: 'En pruebas', items: [
    { to: '/vencimientos', label: 'Vencimientos', icon: CalendarClock, soloEncargado: true },
    { to: '/mostrador', label: 'Tarifas en la tableta', short: 'Tableta', icon: Tablet, soloEncargado: true },
  ] },
];
const visible = (i: NavItem) => !i.soloEncargado || getRol() === 'admin';
const soloAdmin = (el: JSX.Element) => getRol() === 'admin' ? el : <Navigate to="/" replace />;
const cuenta = (n: number, max = 99) => n > max ? `${max}+` : String(n);
const navItems = navGroups.flatMap(g => g.items);
const INICIO: NavItem = { to: '/', label: 'Inicio', icon: LayoutDashboard, exact: true, badge: 'correo' };
// Móvil: lo más usado abajo; el resto, en «Más» por grupos
const BOTTOM = ['/albaranes', '/firmas', '/consulta'];
const bottomItems = [INICIO, ...BOTTOM.map(t => navItems.find(n => n.to === t)!)];
const drawerGroups = navGroups.map(g => ({ ...g, items: g.items.filter(n => !BOTTOM.includes(n.to)) })).filter(g => g.items.length);
const drawerItems = drawerGroups.flatMap(g => g.items);

function SidebarNavGroup({ items, badges, collapsed }: {
  items: typeof navItems;
  badges: NavBadge;
  collapsed: boolean;
}) {
  return (
    <>
      {items.filter(visible).map(({ to, label, icon: Icon, badge, exact }) => {
        const count = badge ? badges[badge as keyof NavBadge] : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            data-tour={`nav-${to.slice(1) || 'inicio'}`}
            title={collapsed ? label : undefined}
          >
            <span className="sidebar-item-icon">
              <Icon size={20} />
              {collapsed && count > 0 && <span className="sidebar-badge">{cuenta(count)}</span>}
            </span>
            {!collapsed && <span className="sidebar-item-label">{label}</span>}
            {!collapsed && count > 0 && <span className="sidebar-badge">{cuenta(count)}</span>}
          </NavLink>
        );
      })}
    </>
  );
}


function Sidebar({ badges, collapsed, onToggle }: { badges: NavBadge; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo — also acts as Home link */}
      <div className="sidebar-logo">
        <NavLink to="/" end style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }} aria-label="Inicio">
          <Logo compact={collapsed} size={collapsed ? 32 : 30} />
        </NavLink>
        {!collapsed && (
          <button className="sidebar-collapse-btn" onClick={onToggle} title="Hacer el menú más estrecho" aria-label="Hacer el menú más estrecho">
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        <SidebarNavGroup items={[INICIO]} badges={badges} collapsed={collapsed} />
      </nav>
      {navGroups.filter(g => g.items.some(visible)).map(g => (
        <nav key={g.titulo} className="sidebar-nav sidebar-nav-grupo" aria-label={g.titulo}>
          {!collapsed && <div className="sidebar-section-label">{g.titulo}</div>}
          <SidebarNavGroup items={g.items} badges={badges} collapsed={collapsed} />
        </nav>
      ))}
      {collapsed ? (
        <button className="sidebar-collapse-btn" style={{ margin: '8px auto 16px' }} onClick={onToggle} title="Ampliar el menú" aria-label="Ampliar el menú">
          <Menu size={18} />
        </button>
      ) : (
        <>
          <MenuCuenta lateral />
          <div className="sidebar-1950"><b>1950</b><span>Materiales de construcción en Boal y Villayón</span></div>
        </>
      )}
    </aside>
  );
}

// ── Al volver atrás, cada pantalla vuelve a donde estabas ──
// Se guarda por entrada del historial (location.key) mientras se baja; al volver (atrás/adelante) se
// recupera, esperando un poco a que la lista termine de cargar. Antes se guardaba al salir con la ruta de
// la pantalla anterior (a partir de la segunda vez iba a otra pantalla) y se ponía antes de que llegaran
// los datos, así que casi nunca volvía a su sitio.
function ScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();
  const clave = `scroll:${location.key}`;
  const rutaAntes = useRef(location.pathname);

  useEffect(() => {
    const el = document.getElementById('app-main');
    if (!el) return;
    let t = 0;
    const guardar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => { try { sessionStorage.setItem(clave, String(el.scrollTop)); } catch { /* nada */ } }, 120);
    };
    el.addEventListener('scroll', guardar, { passive: true });
    return () => { el.removeEventListener('scroll', guardar); window.clearTimeout(t); };
  }, [clave]);

  useEffect(() => {
    const el = document.getElementById('app-main');
    if (!el) return;
    const otraPantalla = rutaAntes.current !== location.pathname;
    rutaAntes.current = location.pathname;
    if (navType !== 'POP') {
      if (otraPantalla) el.scrollTop = 0;  // al cambiar solo un filtro de la misma pantalla no se sube arriba
      return;
    }
    let y = 0;
    try { y = parseInt(sessionStorage.getItem(clave) || '0', 10) || 0; } catch { /* nada */ }
    if (!y) { el.scrollTop = 0; return; }
    let n = 0;
    const id = window.setInterval(() => {
      n++;
      if (el.scrollHeight - el.clientHeight >= y || n > 40) { el.scrollTop = y; window.clearInterval(id); }
    }, 50);
    return () => window.clearInterval(id);
  }, [clave, navType, location.pathname]);

  return null;
}

/** Apartado padre de una ficha (para «Volver» cuando se entra directo, p. ej. desde un aviso). */
const PADRE: Record<string, string> = { documento: '/albaranes', pedidos: '/pedidos', reparaciones: '/reparaciones', firmas: '/firmas', cargas: '/cargas' };
/** ¿Hay pantallas anteriores dentro de la app? (React Router guarda la posición en history.state.idx) */
const hayAtras = () => { try { return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0; } catch { return false; } };
/** A dónde lleva «Volver» si no hay pantalla anterior (se entró directo): la de arriba de esta. */
function padreDe(path: string): string {
  const partes = path.split('/').filter(Boolean);
  if (partes[0] === 'tarifas' && partes.length > 1) return '/' + partes.slice(0, -1).join('/');
  if (partes.length > 1 && partes[0] in PADRE) return PADRE[partes[0]];
  return '/';
}

function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();

  // En Inicio, la cabecera es el logo pegatina (dentro de la página) en lugar de la barra de arriba
  if (location.pathname === '/') return null;
  // Las pantallas de la barra de abajo llevan el logo; todas las demás (las del «Más», las que se abren
  // desde Inicio y las fichas), «Volver» bien visible arriba a la izquierda
  const raiz = BOTTOM.includes(location.pathname);

  // Sin título: cada página ya lo pone en grande
  return (
    <header className="mobile-header">
      {raiz ? (
        <Link to="/" style={{ textDecoration: 'none' }} aria-label="Inicio">
          <Logo size={30} compact />
        </Link>
      ) : (
        <button className="mobile-back-btn" onClick={() => hayAtras() ? navigate(-1) : navigate(padreDe(location.pathname), { replace: true })}>
          <ChevronLeft size={22} /> Volver
        </button>
      )}
      <MenuCuenta className="cuenta-cabecera" />
    </header>
  );
}

function BottomNav({ badges }: { badges: NavBadge }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const isSecondaryActive = drawerItems.some(
    n => location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  );
  // Los avisos de los apartados del cajón también se ven en el botón «Más»
  const enCajon = drawerItems.filter(visible).reduce((s, n) => s + (n.badge ? badges[n.badge] : 0), 0);

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div className="more-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Tools drawer */}
      <div className={`more-drawer${drawerOpen ? ' more-drawer-open' : ''}`}>
        <div className="more-drawer-handle" onClick={() => setDrawerOpen(false)} />
        <div className="more-drawer-title">Más apartados</div>
        {drawerGroups.filter(g => g.items.some(visible)).map(g => (
          <div key={g.titulo}>
            <div className="more-drawer-grupo">{g.titulo}</div>
            <div className="more-drawer-grid">
              {g.items.filter(visible).map(({ to, label, icon: Icon, badge }) => {
                const count = badge ? badges[badge] : 0;
                return (
                  <NavLink key={to} to={to} className={({ isActive }) => `more-drawer-item${isActive ? ' active' : ''}`}>
                    <span className="bn-icon">
                      <Icon size={26} />
                      {count > 0 && <span className="bottom-badge">{cuenta(count, 9)}</span>}
                    </span>
                    <span>{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav (con un difuminado detrás para separarla del contenido) */}
      <div className="bottom-nav-fondo" aria-hidden="true" />
      <nav className="bottom-nav">
        {bottomItems.map(({ to, label, short, icon: Icon, badge, exact }) => {
          const count = badge ? badges[badge as keyof NavBadge] : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
              data-tour={`nav-${to.slice(1) || 'inicio'}`}
            >
              <span className="bn-icon">
                <Icon size={22} />
                {count > 0 && <span className="bottom-badge">{cuenta(count, 9)}</span>}
              </span>
              <span>{short ?? label}</span>
            </NavLink>
          );
        })}
        {/* "More" button */}
        <button
          className={`bottom-nav-item${isSecondaryActive || drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(v => !v)}
          data-tour="nav-mas"
          aria-expanded={drawerOpen}
          aria-label={enCajon > 0 ? `Más apartados (${enCajon} avisos)` : 'Más apartados'}
        >
          <span className="bn-icon">
            <MoreHorizontal size={22} />
            {enCajon > 0 && !drawerOpen && <span className="bottom-badge">{cuenta(enCajon, 9)}</span>}
          </span>
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}

/** Vista reducida para el móvil del camionero (modo reparto). */
function RepartoShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const enLista = location.pathname === '/reparto';
  const [arranque, setArranque] = useState(() => window.innerWidth <= 768 && debeArrancar(window.location.pathname, '/reparto'));
  return (
    <div className="reparto-layout">
      {arranque && <ArranquePegatina onFin={() => setArranque(false)} />}
      <header className="reparto-header">
        {enLista ? (
          <Logo size={22} onDark />
        ) : (
          <button className="mobile-back-btn" onClick={() => navigate('/reparto')}>
            <ChevronLeft size={20} /> Volver
          </button>
        )}
        <span style={{ fontWeight: 700 }}>Reparto · Casa Fonso</span>
        <MenuCuenta className="cuenta-reparto" />
      </header>
      <main id="app-main" className="reparto-main">
        <ScrollRestoration />
        <ErrorPantalla ruta={location.pathname} inicio="/reparto">
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/reparto" element={<RepartoPage />} />
            <Route path="/firmas/:id" element={<FirmaDetailPage />} />
            <Route path="/reparto/cargas/:id" element={<OrdenCargaReparto />} />
            <Route path="/turnos" element={<TurnosPage />} />
            <Route path="*" element={<Navigate to="/reparto" replace />} />
          </Routes>
        </Suspense>
        </ErrorPantalla>
      </main>
    </div>
  );
}

/** Vista de Manolo: solo ver tarifas y vencimientos (rol «consulta»). Igual en móvil y ordenador. */
function ConsultaShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const enInicio = location.pathname === '/';
  return (
    <div className="reparto-layout consulta-layout">
      <header className="reparto-header">
        {enInicio ? (
          <Logo size={24} onDark />
        ) : (
          <button className="consulta-volver" onClick={() => hayAtras() ? navigate(-1) : navigate('/', { replace: true })}>
            <ChevronLeft size={20} /> Volver
          </button>
        )}
        {!enInicio && <Link to="/" className="consulta-titulo" style={{ color: '#fff', textDecoration: 'none' }}>Inicio</Link>}
      </header>
      <main id="app-main" className="reparto-main">
        <ScrollRestoration />
        <ErrorPantalla ruta={location.pathname}>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/" element={<ConsultaInicio />} />
            <Route path="/tarifas" element={<TarifasPage />} />
            <Route path="/tarifas/:prov" element={<TarifaProveedorPage />} />
            <Route path="/tarifas/:prov/:fam" element={<TarifaFamiliaPage />} />
            <Route path="/tarifas/:prov/:fam/ficha" element={<TarifaFichaPage />} />
            <Route path="/vencimientos" element={<VencimientosPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorPantalla>
      </main>
    </div>
  );
}

/** Avisos que pueden llegar desde cualquier pantalla. */
function AvisosGlobales() {
  const { toast, show } = useCfToast();
  useEffect(() => {
    const cache = () => show('Sin cobertura: datos de hace un rato', { aviso: true });
    const cola = (e: Event) => show(String((e as CustomEvent).detail || ''), { aviso: true });
    window.addEventListener('cf-desde-cache', cache);
    window.addEventListener('cf-cola-aviso', cola);
    return () => { window.removeEventListener('cf-desde-cache', cache); window.removeEventListener('cf-cola-aviso', cola); };
  }, [show]);
  return toast;
}

function AppShell() {
  const location = useLocation();
  useEffect(() => {
    if (getRol() === 'consulta') return; // Manolo solo mira: no hay nada que mandar
    arrancarCola(); arrancarColaCargas(); // órdenes de carga: toda la tienda y el reparto
  }, []);
  if (getRol() === 'consulta') return <><ConsultaShell /><AvisosGlobales /><NuevaVersion /></>;
  // Mostrador (tableta junto al ordenador de ventas): a pantalla completa, sin el menú. En pruebas: solo el encargado.
  if (location.pathname === '/mostrador' && getRol() === 'admin') {
    return <><ErrorPantalla><Suspense fallback={<Cargando />}><MostradorPage /></Suspense></ErrorPantalla><AvisosGlobales /><NuevaVersion /></>;
  }
  const reparto = getRol() === 'reparto' || location.pathname === '/reparto' || isReparto();
  return <>{reparto ? <RepartoShell /> : <FullShell />}<AvisosGlobales /><NuevaVersion /></>;
}

function FullShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  const [badges, setBadges] = useState<NavBadge>({ repairs: 0, orders: 0, firmas: 0, correo: 0 });
  // Móvil: animación del camión al abrir la app en Inicio
  const [arranque, setArranque] = useState(() => window.innerWidth <= 768 && debeArrancar(window.location.pathname, '/'));
  const [novedades, setNovedades] = useState(hayNovedades);
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    const abrir = () => { setNovedades(false); setTutorial(true); };
    window.addEventListener('cf-tutorial', abrir);
    return () => window.removeEventListener('cf-tutorial', abrir);
  }, []);

  // Load badge counts (pending repairs + pending orders)
  useEffect(() => {
    const load = () => {
      getDashboardStats().then(({ data }) => {
        setBadges(b => ({
          ...b,
          repairs: data.repairs.pending,
          orders: data.orders.pending,
        }));
      }).catch(() => {});
      getFirmasStats().then(({ data }) => setBadges(b => ({ ...b, firmas: data.pendiente }))).catch(() => {});
      // Correos sin leer (en Inicio): para que se vean desde cualquier pantalla
      getCorreo().then(({ data }) => setBadges(b => ({ ...b, correo: data.configurado ? data.sin_leer.length : 0 }))).catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  // En la pestaña del navegador (ordenadores de la tienda) se ve lo que hay por firmar sin abrir la app
  useEffect(() => {
    document.title = badges.firmas > 0 ? `(${badges.firmas}) Casa Fonso` : 'Casa Fonso';
  }, [badges.firmas]);

  return (
    <div className="app-layout">
      {arranque && <ArranquePegatina onFin={() => setArranque(false)} />}
      {novedades && !arranque && <Novedades onCerrar={() => setNovedades(false)} />}
      {tutorial && <Tutorial onCerrar={() => setTutorial(false)} />}
      <Sidebar badges={badges} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="app-content">
        <MobileHeader />
        <main id="app-main" className="app-main">
          <ScrollRestoration />
          <ErrorPantalla ruta={location.pathname}>
          <Suspense fallback={<Cargando />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/albaranes" element={<HomePage />} />
              <Route path="/documento/:id" element={<DocumentPage />} />
              <Route path="/analisis" element={<AnalyticsPage />} />
              <Route path="/venta" element={<Navigate to="/consulta" replace />} />
              <Route path="/reparaciones" element={<RepairsPage />} />
              <Route path="/reparaciones/:id" element={<RepairDetailPage />} />
              <Route path="/pedidos" element={<OrdersPage />} />
              <Route path="/pedidos/:id" element={<OrderDetailPage />} />
              <Route path="/catalogo" element={<CatalogPage />} />
              <Route path="/consulta" element={<PriceLookupPage />} />
              <Route path="/etiquetas" element={<CustomLabelsPage />} />
              <Route path="/firmas" element={<FirmasPage />} />
              <Route path="/firmas/:id" element={<FirmaDetailPage />} />
              <Route path="/turnos" element={<TurnosPage />} />
              <Route path="/ajustes" element={soloAdmin(<AjustesPage />)} />
              <Route path="/cargas" element={<CargasPage />} />
              <Route path="/cargas/:id" element={<OrdenCargaPage />} />
              <Route path="/tarifas" element={<TarifasPage />} />
              <Route path="/vencimientos" element={soloAdmin(<VencimientosPage />)} />
              <Route path="/mostrador" element={<Navigate to="/tarifas" replace />} />
              <Route path="/tarifas/:prov" element={<TarifaProveedorPage />} />
              <Route path="/tarifas/:prov/:fam" element={<TarifaFamiliaPage />} />
              <Route path="/tarifas/:prov/:fam/ficha" element={<TarifaFichaPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
          </ErrorPantalla>
        </main>
        <BottomNav badges={badges} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AccessGate>
        <AppShell />
      </AccessGate>
    </BrowserRouter>
  );
}
