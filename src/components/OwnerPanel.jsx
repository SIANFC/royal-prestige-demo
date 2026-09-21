import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../lib/supabase";
import "./OwnerPanel.css";

const OWNER_SECTIONS = [
  { name: "Inicio", icon: "⌂" },
  { name: "Asesores", icon: "♙" },
  { name: "Tarjetas NFC / QR", icon: "⌁" },
  { name: "Agendas", icon: "□" },
  { name: "Citas", icon: "◷" },
];

const EMPTY_STATS = {
  advisors: 0,
  activeCards: 0,
  todayAppointments: 0,
  upcomingAppointments: 0,
};

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "AD";
}

function OwnerPanel({ profile, onLogout }) {
  const [activeSection, setActiveSection] = useState("Inicio");
  const [menuOpen, setMenuOpen] = useState(false);
  const [advisorSearch, setAdvisorSearch] = useState("");
  const [cardSearch, setCardSearch] = useState("");
  const [appointmentFilter, setAppointmentFilter] = useState("Todas");
  const [agendaAdvisor, setAgendaAdvisor] = useState("Todos");
  const [showAdvisorForm, setShowAdvisorForm] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cards, setCards] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [selectedAgendaAppointment, setSelectedAgendaAppointment] = useState(null);
  const [appointmentNotes, setAppointmentNotes] = useState([]);
  const [appointmentNotesLoading, setAppointmentNotesLoading] = useState(false);
  const [appointmentNotesError, setAppointmentNotesError] = useState("");
  const [advisors, setAdvisors] = useState([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(false);
  const [advisorsError, setAdvisorsError] = useState("");
  const [cardType, setCardType] = useState("");
  const [cardAdvisor, setCardAdvisor] = useState("");
  const [cardLabel, setCardLabel] = useState("");
  const [cardCreating, setCardCreating] = useState(false);
  const [cardCreateError, setCardCreateError] = useState("");
  const [selectedCardForQr, setSelectedCardForQr] = useState(null);
  const [copiedCardId, setCopiedCardId] = useState(null);
  const [updatingCardId, setUpdatingCardId] = useState(null);
  const [updatingAdvisorId, setUpdatingAdvisorId] = useState(null);
  const [editingAdvisor, setEditingAdvisor] = useState(null);
  const [advisorEditName, setAdvisorEditName] = useState("");
  const [advisorEditPhone, setAdvisorEditPhone] = useState("");
  const [advisorEditEmail, setAdvisorEditEmail] = useState("");
  const [advisorEditPassword, setAdvisorEditPassword] = useState("");
  const [savingAdvisor, setSavingAdvisor] = useState(false);

  const initials = useMemo(
    () => getInitials(profile?.full_name),
    [profile?.full_name]
  );

  const handleNavigation = (section) => {
    setActiveSection(section);
    setMenuOpen(false);
  };

  const setAdvisorActive = async (advisor) => {
    if (!advisor?.profile_id || updatingAdvisorId) return;

    const nextActive = !advisor.active;

    setUpdatingAdvisorId(advisor.advisor_id);
    setAdvisorsError("");

    const { data, error } = await supabase.rpc("set_advisor_active", {
      p_profile_id: advisor.profile_id,
      p_active: nextActive,
    });

    if (error) {
      console.error("ERROR AL CAMBIAR ESTADO DEL ASESOR:", error);
      setAdvisorsError(error.message || "No se pudo actualizar el estado del asesor.");
      setUpdatingAdvisorId(null);
      return;
    }

    console.info("ESTADO DEL ASESOR ACTUALIZADO:", data);
    setAdvisors((current) => current.map((item) => item.advisor_id === advisor.advisor_id ? { ...item, active: nextActive } : item));
    setUpdatingAdvisorId(null);
  };

  const openAdvisorEdit = (advisor) => {
    setEditingAdvisor(advisor);
    setAdvisorEditName(advisor?.full_name || "");
    setAdvisorEditPhone(advisor?.phone || "");
    setAdvisorEditEmail(advisor?.email || "");
    setAdvisorEditPassword("");
    setAdvisorsError("");
  };

  const closeAdvisorEdit = () => {
    if (savingAdvisor) return;

    setEditingAdvisor(null);
    setAdvisorEditName("");
    setAdvisorEditPhone("");
    setAdvisorEditEmail("");
    setAdvisorEditPassword("");
  };

  const saveAdvisorProfile = async () => {
    if (!editingAdvisor?.profile_id || savingAdvisor) return;

    const fullName = advisorEditName.trim();
    const phone = advisorEditPhone.trim();
    const email = advisorEditEmail.trim().toLowerCase();
    const password = advisorEditPassword;

    const currentEmail = String(editingAdvisor.email || "")
      .trim()
      .toLowerCase();

    const emailChanged = email !== currentEmail;
    const passwordChanged = password.length > 0;

    if (!fullName) {
      setAdvisorsError("El nombre completo del asesor es obligatorio.");
      return;
    }

    if (!email) {
      setAdvisorsError("El correo electrónico del asesor es obligatorio.");
      return;
    }

    if (passwordChanged && password.length < 8) {
      setAdvisorsError(
        "La nueva contraseña debe tener al menos 8 caracteres."
      );
      return;
    }

    setSavingAdvisor(true);
    setAdvisorsError("");

    /*
     * Primero actualizamos los datos del perfil.
     */
    const {
      data: profileData,
      error: profileUpdateError,
    } = await supabase.rpc("update_advisor_profile", {
      p_profile_id: editingAdvisor.profile_id,
      p_full_name: fullName,
      p_phone: phone || null,
    });

    if (profileUpdateError) {
      console.error(
        "ERROR AL ACTUALIZAR PERFIL DEL ASESOR:",
        profileUpdateError
      );

      setAdvisorsError(
        profileUpdateError.message ||
          "No se pudo actualizar el perfil del asesor."
      );

      setSavingAdvisor(false);
      return;
    }

    console.info("PERFIL DEL ASESOR ACTUALIZADO:", profileData);

    /*
     * Si cambió correo, contraseña o ambos,
     * utilizamos la Edge Function administrativa.
     */
    if (emailChanged || passwordChanged) {
      const { data: authData, error: authError } =
        await supabase.functions.invoke("update-advisor-auth", {
          body: {
            profile_id: editingAdvisor.profile_id,
            ...(emailChanged ? { email } : {}),
            ...(passwordChanged ? { password } : {}),
          },
        });

      if (authError || !authData?.success) {
        console.error(
          "ERROR AL ACTUALIZAR AUTH DEL ASESOR:",
          authError || authData
        );

        setAdvisorsError(
          authData?.error ||
            authError?.message ||
            "El perfil se actualizó, pero no se pudieron actualizar las credenciales."
        );

        setSavingAdvisor(false);
        return;
      }

      console.info(
        "CREDENCIALES DEL ASESOR ACTUALIZADAS:",
        authData
      );
    }

    setAdvisors((current) =>
      current.map((item) =>
        item.advisor_id === editingAdvisor.advisor_id
          ? {
              ...item,
              full_name: fullName,
              phone: phone || null,
              email,
            }
          : item
      )
    );

    setSavingAdvisor(false);
    setEditingAdvisor(null);
    setAdvisorEditName("");
    setAdvisorEditPhone("");
    setAdvisorEditEmail("");
    setAdvisorEditPassword("");
  };

  useEffect(() => {
    let mounted = true;

    const loadOwnerData = async () => {
      if (profile?.role !== "admin") return;

      setAdvisorsLoading(true);
      setCardsLoading(true);
      setAdvisorsError("");
      setCardsError("");

      const [advisorsResult, cardsResult] = await Promise.all([
        supabase.rpc("get_admin_advisors"),
        supabase.rpc("get_admin_advisor_cards"),
      ]);

      if (!mounted) return;

      if (advisorsResult.error) {
        console.error("ERROR AL CARGAR ASESORES:", advisorsResult.error);
        setAdvisors([]);
        setAdvisorsError("No se pudieron cargar los asesores.");
      } else {
        setAdvisors(Array.isArray(advisorsResult.data) ? advisorsResult.data : []);
      }

      if (cardsResult.error) {
        console.error("ERROR AL CARGAR TARJETAS NFC / QR:", cardsResult.error);
        setCards([]);
        setCardsError("No se pudieron cargar las tarjetas.");
      } else {
        setCards(Array.isArray(cardsResult.data) ? cardsResult.data : []);
      }

      setAdvisorsLoading(false);
      setCardsLoading(false);
    };

    loadOwnerData();

    return () => {
      mounted = false;
    };
  }, [profile?.role]);

  useEffect(() => {
    let mounted = true;

    const loadAdminAppointments = async () => {
      if (
        profile?.role !== "admin" ||
        (activeSection !== "Agendas" && activeSection !== "Citas")
      ) {
        return;
      }

      setAppointmentsLoading(true);
      setAppointmentsError("");

      const { data, error } = await supabase.rpc(
        "get_admin_appointments"
      );

      if (!mounted) return;

      if (error) {
        console.error(
          "ERROR AL CARGAR CITAS ADMINISTRATIVAS:",
          error
        );

        setAppointments([]);
        setAppointmentsError(
          error.message ||
            "No se pudieron cargar las citas."
        );
      } else {
        console.info(
          "CITAS ADMINISTRATIVAS CARGADAS:",
          data
        );

        setAppointments(
          Array.isArray(data) ? data : []
        );
      }

      setAppointmentsLoading(false);
    };

    loadAdminAppointments();

    return () => {
      mounted = false;
    };
  }, [profile?.role, activeSection]);

  const openAgendaAppointment = async (appointment) => {
    if (!appointment?.appointment_id) return;

    setSelectedAgendaAppointment(appointment);
    setAppointmentNotes([]);
    setAppointmentNotesError("");
    setAppointmentNotesLoading(true);

    const { data, error } = await supabase
      .from("appointment_notes")
      .select("id, appointment_id, advisor_id, note, created_at")
      .eq("appointment_id", appointment.appointment_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ERROR AL CARGAR HISTORIAL DE NOTAS DE LA CITA:", error);
      setAppointmentNotes([]);
      setAppointmentNotesError(
        error.message ||
          "No se pudo cargar el historial de notas de la cita."
      );
    } else {
      console.info("HISTORIAL DE NOTAS DE CITA CARGADO:", data);
      setAppointmentNotes(Array.isArray(data) ? data : []);
    }

    setAppointmentNotesLoading(false);
  };

  const closeAgendaAppointment = () => {
    setSelectedAgendaAppointment(null);
    setAppointmentNotes([]);
    setAppointmentNotesError("");
    setAppointmentNotesLoading(false);
  };

  const stats = useMemo(() => ({
    advisors: advisors.filter((advisor) => advisor.active).length,
    activeCards: cards.filter((card) => card.active).length,
    todayAppointments: 0,
    upcomingAppointments: 0,
  }), [advisors, cards]);

  const getPublicCardUrl = (token) => {
    if (!token) return "";
    return `${window.location.origin}/rifa?ref=${encodeURIComponent(token)}`;
  };

  const copyCardUrl = async (card, event) => {
    if (!card?.token) return;

    const url = getPublicCardUrl(card.token);

    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedCardId(card.card_id);

      if (event?.currentTarget) {
        event.currentTarget.blur();
      }

      window.setTimeout(() => {
        setCopiedCardId((current) =>
          current === card.card_id ? null : current
        );
      }, 1800);
    } catch (error) {
      console.error("ERROR AL COPIAR URL:", error);
    }
  };

  const downloadCardQrSvg = (card) => {
    const qrSvg = document.querySelector(".owner-card-qr-preview svg");

    if (!qrSvg || !card?.token) return;

    const clonedSvg = qrSvg.cloneNode(true);

    clonedSvg.setAttribute("width", "30mm");
    clonedSvg.setAttribute("height", "30mm");

    const serializer = new XMLSerializer();
    const svgContent = serializer.serializeToString(clonedSvg);

    const blob = new Blob(
      [svgContent],
      { type: "image/svg+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${card.label || "tarjeta"}-${card.token}-QR.svg`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const openCardQr = (card) => {
    setCopiedCardId(null);
    setSelectedCardForQr(card);
  };

  const closeCardQr = () => {
    setCopiedCardId(null);
    setSelectedCardForQr(null);
  };

  const toggleCardActive = async (card) => {
    if (!card?.card_id || updatingCardId === card.card_id) return;

    setUpdatingCardId(card.card_id);
    setCardsError("");

    const { error } = await supabase.rpc("set_advisor_card_active", {
      p_card_id: card.card_id,
      p_active: !card.active,
    });

    if (error) {
      console.error("ERROR AL CAMBIAR ESTADO DE TARJETA:", error);
      setCardsError(
        error.message || "No se pudo cambiar el estado de la tarjeta."
      );
      setUpdatingCardId(null);
      return;
    }

    const { data: refreshedCards, error: refreshError } = await supabase.rpc(
      "get_admin_advisor_cards"
    );

    if (refreshError) {
      console.error("ERROR AL ACTUALIZAR TARJETAS:", refreshError);
      setCardsError(
        "El estado cambió, pero no se pudo actualizar el listado."
      );
    } else {
      setCards(Array.isArray(refreshedCards) ? refreshedCards : []);
    }

    setUpdatingCardId(null);
  };

  const openCardForm = () => {
    setCardType("");
    setCardAdvisor("");
    setCardLabel("");
    setCardCreateError("");
    setCardCreating(false);
    setShowCardForm(true);
  };

  const createCard = async () => {
    if (!cardType || !cardAdvisor || cardCreating) return;

    setCardCreating(true);
    setCardCreateError("");

    const { data, error } = await supabase.rpc("create_advisor_card", {
      p_advisor_id: cardAdvisor,
      p_card_type: cardType,
      p_label: cardLabel.trim() || null,
    });

    if (error) {
      console.error("ERROR AL CREAR TARJETA NFC / QR:", error);
      setCardCreateError(error.message || "No se pudo crear la tarjeta.");
      setCardCreating(false);
      return;
    }

    console.info("TARJETA CREADA:", data);

    const { data: refreshedCards, error: refreshError } = await supabase.rpc(
      "get_admin_advisor_cards"
    );

    if (refreshError) {
      console.error("ERROR AL ACTUALIZAR TARJETAS:", refreshError);
      setCardsError("La tarjeta se creó, pero no se pudo actualizar el listado.");
    } else {
      setCards(Array.isArray(refreshedCards) ? refreshedCards : []);
    }

    setCardCreating(false);
    setShowCardForm(false);
    setCardType("");
    setCardAdvisor("");
    setCardLabel("");
  };

  return (
    <div className="owner-shell">
      <aside className={`owner-sidebar ${menuOpen ? "owner-sidebar-open" : ""}`}>
        <div className="owner-sidebar-top">
          <div className="owner-brand">
            <div className="owner-logo">RP</div>
            <div className="owner-wordmark">
              <span>ROYAL</span>
              <strong>PRESTIGE</strong>
            </div>
          </div>

          <button
            type="button"
            className="owner-mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            ×
          </button>

          <div className="owner-user-card">
            <div className="owner-avatar">{initials}</div>
            <div>
              <strong>{profile?.full_name || "Administrador"}</strong>
              <span>Administrador</span>
            </div>
          </div>

          <div className="owner-divider" />

          <nav className="owner-nav">
            <span className="owner-nav-title">ADMINISTRACIÓN</span>

            {OWNER_SECTIONS.map((item) => (
              <button
                type="button"
                key={item.name}
                className={`owner-nav-item ${
                  activeSection === item.name ? "active" : ""
                }`}
                onClick={() => handleNavigation(item.name)}
              >
                <span className="owner-nav-icon">{item.icon}</span>
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="owner-sidebar-bottom">
          <button
            type="button"
            className={`owner-nav-item ${
              activeSection === "Configuración" ? "active" : ""
            }`}
            onClick={() => handleNavigation("Configuración")}
          >
            <span className="owner-nav-icon">⚙</span>
            <span>Configuración</span>
          </button>

          <button
            type="button"
            className="owner-logout"
            onClick={onLogout}
          >
            <span className="owner-nav-icon">↪</span>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {menuOpen && (
        <div
          className="owner-mobile-overlay"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="owner-main">
        <header className="owner-mobile-header">
          <button
            type="button"
            className="owner-hamburger"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="owner-mobile-brand">
            <span>ROYAL</span>
            <strong>PRESTIGE</strong>
          </div>

          <div className="owner-mobile-avatar">{initials}</div>
        </header>

        <header className="owner-topbar">
          <div>
            <span className="owner-topbar-label">PANEL DUEÑO</span>
            <h1>{activeSection}</h1>
          </div>

          <div className="owner-topbar-right">
            <button
              type="button"
              className="owner-notification"
              aria-label="Notificaciones"
            >
              <span>◇</span>
              <i />
            </button>

            <div className="owner-topbar-user">
              <div className="owner-topbar-avatar">{initials}</div>
              <div>
                <strong>{profile?.full_name || "Administrador"}</strong>
                <span>Administrador</span>
              </div>
            </div>
          </div>
        </header>

        <div className="owner-content">
          {activeSection === "Inicio" && (
            <OwnerDashboard
              profile={profile}
              stats={stats}
              onNavigate={handleNavigation}
            />
          )}

          {activeSection === "Asesores" && (
            <OwnerAdvisors
              advisors={advisors}
              loading={advisorsLoading}
              error={advisorsError}
              search={advisorSearch}
              setSearch={setAdvisorSearch}
              onNew={() => setShowAdvisorForm(true)}
              onToggleActive={setAdvisorActive}
              updatingAdvisorId={updatingAdvisorId}
              onEdit={openAdvisorEdit}
              savingAdvisor={savingAdvisor}
            />
          )}

          {activeSection === "Tarjetas NFC / QR" && (
            <OwnerCards
              cards={cards}
              loading={cardsLoading}
              error={cardsError}
              search={cardSearch}
              setSearch={setCardSearch}
              advisors={advisors}
              onNew={openCardForm}
              onOpenQr={openCardQr}
              onCopyUrl={copyCardUrl}
              copiedCardId={copiedCardId}
              onToggleActive={toggleCardActive}
              updatingCardId={updatingCardId}
            />
          )}

          {activeSection === "Agendas" && (
            <OwnerAgendas
              advisor={agendaAdvisor}
              setAdvisor={setAgendaAdvisor}
              advisors={advisors}
              advisorsLoading={advisorsLoading}
              appointments={appointments}
              loading={appointmentsLoading}
              error={appointmentsError}
              onSelectAppointment={openAgendaAppointment}
            />
          )}

          {activeSection === "Citas" && (
            <OwnerAppointments
              filter={appointmentFilter}
              setFilter={setAppointmentFilter}
              appointments={appointments}
              loading={appointmentsLoading}
              error={appointmentsError}
              onSelectAppointment={openAgendaAppointment}
            />
          )}

          {activeSection === "Configuración" && (
            <OwnerSettings profile={profile} initials={initials} />
          )}
        </div>
      </main>

      {editingAdvisor && (
        <OwnerVisualModal
          title="Editar asesor"
          eyebrow="DATOS DEL ASESOR"
          onClose={closeAdvisorEdit}
        >
          <div className="owner-form-grid">
            <label className="owner-field">
              <span>Nombre completo</span>
              <input
                type="text"
                value={advisorEditName}
                onChange={(event) => setAdvisorEditName(event.target.value)}
                placeholder="Nombre del asesor"
                disabled={savingAdvisor}
              />
            </label>

            <label className="owner-field">
              <span>Teléfono</span>
              <input
                type="text"
                value={advisorEditPhone}
                onChange={(event) => setAdvisorEditPhone(event.target.value)}
                placeholder="449 000 0000"
                disabled={savingAdvisor}
              />
            </label>

            <label className="owner-field">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={advisorEditEmail}
                onChange={(event) => setAdvisorEditEmail(event.target.value)}
                placeholder="correo@ejemplo.com"
                autoComplete="off"
                disabled={savingAdvisor}
              />
            </label>

            <label className="owner-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                value={advisorEditPassword}
                onChange={(event) => setAdvisorEditPassword(event.target.value)}
                placeholder="Dejar vacío para no cambiarla"
                autoComplete="new-password"
                disabled={savingAdvisor}
              />
            </label>
          </div>

          {advisorsError && (
            <div className="owner-data-error" role="alert">
              {advisorsError}
            </div>
          )}

          <div className="owner-form-note">
            <span>i</span>
            <p>
              Puedes modificar nombre, teléfono y correo. Si necesitas cambiar
              la contraseña del asesor, escribe una nueva; si la dejas vacía,
              la contraseña actual se conserva. El rol y el estado de la cuenta
              se mantienen sin cambios.
            </p>
          </div>

          <div className="owner-modal-actions">
            <button
              type="button"
              className="owner-button secondary"
              onClick={closeAdvisorEdit}
              disabled={savingAdvisor}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="owner-button primary"
              onClick={saveAdvisorProfile}
              disabled={
                savingAdvisor ||
                !advisorEditName.trim() ||
                !advisorEditEmail.trim()
              }
            >
              {savingAdvisor ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </OwnerVisualModal>
      )}

      {showAdvisorForm && (
        <OwnerVisualModal
          title="Nuevo asesor"
          eyebrow="ALTA DE ASESOR"
          onClose={() => setShowAdvisorForm(false)}
        >
          <div className="owner-form-grid">
            <OwnerField label="Nombre completo" placeholder="Nombre del asesor" />
            <OwnerField label="Correo electrónico" placeholder="correo@ejemplo.com" />
            <OwnerField label="Teléfono" placeholder="449 000 0000" />
            <OwnerField label="Contraseña inicial" placeholder="Se definirá al crear la cuenta" type="password" />
          </div>

          <div className="owner-form-note">
            <span>i</span>
            <p>
              Esta pantalla ya está preparada para el alta real. El guardado
              se conectará al Edge Function <strong>create-advisor</strong> y
              a Supabase cuando conectemos este módulo.
            </p>
          </div>

          <div className="owner-modal-actions">
            <button type="button" className="owner-button secondary" onClick={() => setShowAdvisorForm(false)}>
              Cancelar
            </button>
            <button type="button" className="owner-button primary" disabled>
              Crear asesor
            </button>
          </div>
        </OwnerVisualModal>
      )}

      {selectedCardForQr && (
  <OwnerVisualModal
    title="QR y enlace público"
    eyebrow="TARJETA NFC / QR"
    onClose={closeCardQr}
  >
    <div className="owner-card-qr-modal">
      <div className="owner-card-qr-preview">
        <QRCodeSVG
          value={getPublicCardUrl(selectedCardForQr.token)}
          size={220}
          level="H"
          includeMargin
        />
      </div>

      <div className="owner-card-qr-info">
        <span className="owner-panel-eyebrow">
          ENLACE PÚBLICO
        </span>

        <h3>
          {selectedCardForQr.label || "Tarjeta sin etiqueta"}
        </h3>

        <div className="owner-card-qr-meta">
          <div>
            <span>Tarjeta</span>
            <strong>
              {selectedCardForQr.label || "Sin etiqueta"}
            </strong>
          </div>

          <div>
            <span>Asesor</span>
            <strong>
              {selectedCardForQr.advisor_name || "Sin asesor"}
            </strong>
          </div>

          <div>
            <span>Tipo</span>
            <strong>
              {selectedCardForQr.card_type || "Sin tipo"}
            </strong>
          </div>

          <div>
            <span>Token</span>
            <strong>
              {selectedCardForQr.token || "Sin token"}
            </strong>
          </div>
        </div>

        <label className="owner-card-url-field">
          <span>URL pública</span>

          <input
            type="text"
            value={getPublicCardUrl(selectedCardForQr.token)}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </label>

        <div className="owner-card-qr-actions">
          <button
            type="button"
            className="owner-button primary"
            onClick={() => {
              const url = getPublicCardUrl(selectedCardForQr.token);

              if (!url) return;

              window.open(
                url,
                "_blank",
                "noopener,noreferrer"
              );
            }}
          >
            Abrir URL pública
          </button>

          <button
            type="button"
            className="owner-button secondary"
            onClick={(event) => {
              copyCardUrl(selectedCardForQr, event);
            }}
          >
            {copiedCardId === selectedCardForQr.card_id
              ? "URL copiada"
              : "Copiar URL"}
              
          </button>

          <button
            type="button"
            className="owner-button secondary"
            onClick={() => downloadCardQrSvg(selectedCardForQr)}
          >
            Descargar QR para impresión
          </button>

          <button
            type="button"
            className="owner-button secondary"
            onClick={closeCardQr}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </OwnerVisualModal>
)}
      {selectedAgendaAppointment && (
        <OwnerAgendaAppointmentModal
          appointment={selectedAgendaAppointment}
          notes={appointmentNotes}
          notesLoading={appointmentNotesLoading}
          notesError={appointmentNotesError}
          onClose={closeAgendaAppointment}
        />
      )}

      {showCardForm && (
        <OwnerVisualModal
          title="Nueva tarjeta"
          eyebrow="NFC / QR"
          onClose={() => setShowCardForm(false)}
        >
          <div className="owner-form-grid">
            <label className="owner-field">
              <span>Tipo</span>
              <select value={cardType} onChange={(event) => setCardType(event.target.value)}>
                <option value="">Selecciona un tipo</option>
                <option value="NFC">NFC</option>
                <option value="QR">QR</option>
              </select>
            </label>

            <label className="owner-field">
              <span>Asesor asignado</span>
              <select value={cardAdvisor} onChange={(event) => setCardAdvisor(event.target.value)}>
                <option value="">Selecciona un asesor</option>
                {advisors.filter((advisor) => advisor.active).map((advisor) => (
                  <option key={advisor.advisor_id} value={advisor.advisor_id}>
                    {advisor.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="owner-field">
              <span>Etiqueta</span>
              <input
                type="text"
                value={cardLabel}
                onChange={(event) => setCardLabel(event.target.value)}
                placeholder="Ej. Tarjeta 001"
              />
            </label>
          </div>

          <div className="owner-form-note">
            <span>i</span>
            <p>
              El token único y la activación se generarán de forma segura desde
              Supabase al crear la tarjeta.
            </p>
          </div>

          {cardCreateError && (
            <div className="owner-data-error" role="alert">
              {cardCreateError}
            </div>
          )}

          <div className="owner-modal-actions">
            <button
              type="button"
              className="owner-button secondary"
              onClick={() => setShowCardForm(false)}
              disabled={cardCreating}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="owner-button primary"
              disabled={!cardType || !cardAdvisor || cardCreating}
              onClick={createCard}
            >
              {cardCreating ? "Creando..." : "Crear tarjeta"}
            </button>
          </div>
        </OwnerVisualModal>
      )}
    </div>
  );
}

function OwnerDashboard({ profile, stats, onNavigate }) {
  const today = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">RESUMEN GENERAL</span>
          <h2>Bienvenido, {profile?.full_name?.split(" ")[0] || "Administrador"}.</h2>
          <p>
            Control general de asesores, tarjetas, agendas y citas de Royal Prestige.
          </p>
        </div>
        <div className="owner-date-card">
          <span>HOY</span>
          <strong>{today.charAt(0).toUpperCase() + today.slice(1)}</strong>
        </div>
      </div>

      <div className="owner-stat-grid">
        <OwnerStat label="Asesores activos" value={stats.advisors} detail="Activos actualmente" icon="♙" />
        <OwnerStat label="Tarjetas activas" value={stats.activeCards} detail="NFC / QR disponibles" icon="⌁" />
        <OwnerStat label="Citas de hoy" value={stats.todayAppointments} detail="Agenda del día" icon="◷" />
        <OwnerStat label="Próximas citas" value={stats.upcomingAppointments} detail="Pendientes de atención" icon="→" />
      </div>

      <div className="owner-dashboard-grid">
        <div className="owner-panel-card owner-large-card">
          <div className="owner-panel-heading">
            <div>
              <span className="owner-panel-eyebrow">ACTIVIDAD</span>
              <h3>Actividad reciente</h3>
            </div>
            <span className="owner-muted-chip">Sin registros</span>
          </div>

          <OwnerEmptyState
            icon="◇"
            title="Todavía no hay actividad"
            text="Cuando existan asesores, tarjetas y citas, aquí aparecerán los movimientos recientes del sistema."
          />
        </div>

        <div className="owner-panel-card">
          <div className="owner-panel-heading">
            <div>
              <span className="owner-panel-eyebrow">OPERACIÓN</span>
              <h3>Accesos rápidos</h3>
            </div>
          </div>

          <div className="owner-quick-actions">
            <button type="button" onClick={() => onNavigate("Asesores")}>
              <span>♙</span>
              <div>
                <strong>Administrar asesores</strong>
                <small>Altas, estados y asignaciones</small>
              </div>
              <b>→</b>
            </button>

            <button type="button" onClick={() => onNavigate("Tarjetas NFC / QR")}>
              <span>⌁</span>
              <div>
                <strong>Administrar tarjetas</strong>
                <small>Tokens, QR y asignaciones</small>
              </div>
              <b>→</b>
            </button>

            <button type="button" onClick={() => onNavigate("Citas")}>
              <span>◷</span>
              <div>
                <strong>Consultar citas</strong>
                <small>Información de la agenda comercial</small>
              </div>
              <b>→</b>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function OwnerStat({ label, value, detail, icon }) {
  return (
    <div className="owner-stat-card">
      <div className="owner-stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function OwnerAdvisors({
  advisors,
  loading,
  error,
  search,
  setSearch,
  onNew,
  onToggleActive,
  updatingAdvisorId,
  onEdit,
  savingAdvisor,
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredAdvisors = advisors.filter((advisor) => {
    if (!normalizedSearch) return true;
    return [advisor.full_name, advisor.email, advisor.phone]
      .some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">GESTIÓN DE USUARIOS</span>
          <h2>Asesores</h2>
          <p>Administra las cuentas, estado y operación de los asesores comerciales.</p>
        </div>
        <button type="button" className="owner-button primary" onClick={onNew}>
          + Nuevo asesor
        </button>
      </div>

      <div className="owner-toolbar">
        <div className="owner-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar asesor..."
          />
        </div>
        <div className="owner-toolbar-count">
          {loading ? "Cargando..." : `${filteredAdvisors.length} asesores`}
        </div>
      </div>

      {error && (
        <div className="owner-data-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="owner-panel-card">
          <OwnerEmptyState compact icon="♙" title="Cargando asesores" text="Consultando los asesores registrados en Supabase." />
        </div>
      ) : filteredAdvisors.length === 0 ? (
        <div className="owner-panel-card">
          <OwnerEmptyState
            icon="♙"
            title={advisors.length === 0 ? "No hay asesores registrados" : "No hay resultados"}
            text={advisors.length === 0 ? "El sistema está vacío. Los asesores reales se crearán desde este módulo mediante Supabase Auth y el flujo seguro de alta." : "No encontramos asesores que coincidan con la búsqueda actual."}
            actionLabel={advisors.length === 0 ? "Nuevo asesor" : undefined}
            onAction={advisors.length === 0 ? onNew : undefined}
          />
        </div>
      ) : (
        <div className="owner-advisor-list">
          <div className="owner-advisor-list-header">
            <span>ASESOR</span>
            <span>CORREO</span>
            <span>TELÉFONO</span>
            <span>ESTADO</span>
            <span>ACCIÓN</span>
          </div>
          {filteredAdvisors.map((advisor) => (
            <div className="owner-advisor-row" key={advisor.advisor_id}>
              <div className="owner-card-cell">
                <strong>{advisor.full_name}</strong>
              </div>
              <div className="owner-card-cell"><span>{advisor.email || "—"}</span></div>
              <div className="owner-card-cell"><span>{advisor.phone || "—"}</span></div>
              <div className={`owner-card-status ${advisor.active ? "active" : "inactive"}`}>
                {advisor.active ? "Activo" : "Inactivo"}
              </div>
              <div className="owner-advisor-action">
                <button
                  type="button"
                  className="owner-button secondary"
                  onClick={() => onEdit(advisor)}
                  disabled={updatingAdvisorId === advisor.advisor_id || savingAdvisor}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={`owner-button ${advisor.active ? "secondary" : "primary"}`}
                  onClick={() => onToggleActive(advisor)}
                  disabled={updatingAdvisorId === advisor.advisor_id}
                >
                  {updatingAdvisorId === advisor.advisor_id ? "Actualizando..." : advisor.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OwnerCards({ cards, advisors, loading, error, search, setSearch, onNew, onOpenQr, onCopyUrl, copiedCardId, onToggleActive, updatingCardId }) {
  const normalizedSearch = search.trim().toLowerCase();

  const filteredCards = cards.filter((card) => {
    if (!normalizedSearch) return true;

    return [
      card.token,
      card.label,
      card.advisor_name,
      card.card_type,
    ].some((value) =>
      String(value || "").toLowerCase().includes(normalizedSearch)
    );
  });

  const activeNfc = cards.filter((card) => card.active && card.card_type === "NFC");
  const activeQr = cards.filter((card) => card.active && card.card_type === "QR");
  const inactiveCards = cards.filter((card) => !card.active);

  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">CAPTACIÓN</span>
          <h2>Tarjetas NFC / QR</h2>
          <p>Administra tokens, asignaciones y estados de tarjetas.</p>
        </div>
        <button type="button" className="owner-button primary" onClick={onNew}>
          + Nueva tarjeta
        </button>
      </div>

      <div className="owner-toolbar">
        <div className="owner-search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por token, etiqueta o asesor..."
          />
        </div>
        <div className="owner-toolbar-count">
          {loading ? "Cargando..." : `${filteredCards.length} tarjetas`}
        </div>
      </div>

      <div className="owner-card-type-grid">
        <div className="owner-mini-stat">
          <span>NFC</span>
          <strong>{activeNfc.length}</strong>
          <small>Activas</small>
        </div>
        <div className="owner-mini-stat">
          <span>QR</span>
          <strong>{activeQr.length}</strong>
          <small>Activas</small>
        </div>
        <div className="owner-mini-stat">
          <span>Inactivas</span>
          <strong>{inactiveCards.length}</strong>
          <small>Tarjetas desactivadas</small>
        </div>
      </div>

      {error && (
        <div className="owner-data-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="owner-panel-card">
          <OwnerEmptyState
            compact
            icon="⌁"
            title="Cargando tarjetas"
            text="Consultando las tarjetas registradas en Supabase."
          />
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="owner-panel-card">
          <OwnerEmptyState
            icon="⌁"
            title={cards.length === 0 ? "No hay tarjetas registradas" : "No hay resultados"}
            text={
              cards.length === 0
                ? "Cada tarjeta tendrá un token único y quedará vinculada a un asesor. El token no se expondrá como identificador interno."
                : "No encontramos tarjetas que coincidan con la búsqueda actual."
            }
            actionLabel={cards.length === 0 ? "Nueva tarjeta" : undefined}
            onAction={cards.length === 0 ? onNew : undefined}
          />
        </div>
      ) : (
        <div className="owner-card-list">
          <div className="owner-card-list-header">
            <span>TIPO</span>
            <span>ASESOR</span>
            <span>ETIQUETA</span>
            <span>TOKEN</span>
            <span>ESTADO</span>
          </div>

          {filteredCards.map((card) => (
            <div className="owner-card-row" key={card.card_id}>
              <div className="owner-card-type-badge">
                <span>{card.card_type}</span>
              </div>

              <div className="owner-card-cell owner-card-advisor">
                <strong>{card.advisor_name || "Sin asesor"}</strong>
              </div>

              <div className="owner-card-cell">
                <span>{card.label || "Sin etiqueta"}</span>
              </div>

              <div className="owner-card-cell owner-card-token">
                <span>{card.token}</span>
                <div className="owner-card-link-actions">
                  <button
                    type="button"
                    className="owner-card-link-button"
                    onClick={() => onOpenQr(card)}
                  >
                    QR / URL
                  </button>
                  <button
                    type="button"
                    className="owner-card-link-button"
                    onClick={(event) => onCopyUrl(card, event)}
                  >
                    {copiedCardId === card.card_id ? "Copiada" : "Copiar"}
                  </button>
                </div>
              </div>

              <div className={`owner-card-status ${card.active ? "active" : "inactive"}`}>
                <span>{card.active ? "Activa" : "Inactiva"}</span>
                <button
                  type="button"
                  className="owner-card-link-button"
                  onClick={() => onToggleActive(card)}
                  disabled={updatingCardId === card.card_id}
                >
                  {updatingCardId === card.card_id
                    ? "Guardando..."
                    : card.active
                      ? "Desactivar"
                      : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OwnerAgendas({
  advisor,
  setAdvisor,
  advisors,
  advisorsLoading,
  appointments,
  loading,
  error,
  onSelectAppointment,
}) {
  const [calendarDate, setCalendarDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const filteredAppointments =
    advisor === "Todos"
      ? appointments
      : appointments.filter(
          (appointment) =>
            appointment?.advisor_name === advisor
        );

  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const today = new Date();
  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(calendarDate);

  const daysInMonth = new Date(
    calendarYear,
    calendarMonth + 1,
    0
  ).getDate();

  const firstDayIndex =
    (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;

  const calendarCells = [];

  for (let index = 0; index < firstDayIndex; index += 1) {
    calendarCells.push({
      type: "empty",
      key: `empty-${calendarYear}-${calendarMonth}-${index}`,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(
      2,
      "0"
    )}-${String(day).padStart(2, "0")}`;

    const dayAppointments = filteredAppointments.filter(
      (appointment) => appointment?.appointment_date === dateKey
    );

    calendarCells.push({
      type: "day",
      key: dateKey,
      day,
      dateKey,
      dayAppointments,
    });
  }

  const goToPreviousMonth = () => {
    setCalendarDate(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCalendarDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
    );
  };

  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">CONSULTA</span>
          <h2>Agendas</h2>
          <p>Consulta la agenda de cada asesor y sus citas programadas.</p>
        </div>

        <div className="owner-select-wrap">
          <label htmlFor="agenda-advisor">Asesor</label>
          <select
            id="agenda-advisor"
            value={advisor}
            onChange={(event) => setAdvisor(event.target.value)}
            disabled={advisorsLoading}
          >
            <option value="Todos">Todos los asesores</option>

            {advisors.map((item) => (
              <option
                key={item.advisor_id}
                value={item.full_name}
              >
                {item.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="owner-calendar-card">
        <div className="owner-calendar-top">
          <div>
            <span className="owner-panel-eyebrow">AGENDA COMERCIAL</span>
            <h3>Calendario</h3>
          </div>
          <div className="owner-calendar-nav">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={goToPreviousMonth}
            >
              ‹
            </button>
            <strong>
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </strong>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={goToNextMonth}
            >
              ›
            </button>
          </div>
        </div>

        <div className="owner-calendar-week">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        {error ? (
          <div className="owner-data-error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <OwnerEmptyState
            compact
            icon="□"
            title="Cargando agenda"
            text="Consultando las citas reales registradas en Supabase."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              marginTop: "14px",
              borderTop: "1px solid #eef1f4",
              borderLeft: "1px solid #eef1f4",
              overflow: "hidden",
              borderRadius: "12px",
            }}
          >
            {calendarCells.map((cell) => {
              if (cell.type === "empty") {
                return (
                  <div
                    key={cell.key}
                    style={{
                      minHeight: "112px",
                      borderRight: "1px solid #eef1f4",
                      borderBottom: "1px solid #eef1f4",
                      background: "#fafbfc",
                    }}
                  />
                );
              }

              const isToday =
                cell.day === today.getDate() &&
                calendarMonth === today.getMonth() &&
                calendarYear === today.getFullYear();

              return (
                <div
                  key={cell.key}
                  style={{
                    minHeight: "112px",
                    padding: "9px",
                    borderRight: "1px solid #eef1f4",
                    borderBottom: "1px solid #eef1f4",
                    background: isToday ? "#f7fbff" : "#fff",
                  }}
                >
                  <div
                    style={{
                      width: "27px",
                      height: "27px",
                      display: "grid",
                      placeItems: "center",
                      marginBottom: "7px",
                      borderRadius: "50%",
                      background: isToday ? "#168ee5" : "transparent",
                      color: isToday ? "#fff" : "#66717d",
                      fontSize: "10px",
                      fontWeight: 700,
                    }}
                  >
                    {cell.day}
                  </div>

                  <div style={{ display: "grid", gap: "5px" }}>
                    {cell.dayAppointments.map((appointment) => {
                      const startTime = appointment?.start_time
                        ? appointment.start_time.slice(0, 5)
                        : "Sin hora";

                      return (
                        <button
                          type="button"
                          key={appointment?.appointment_id}
                          onClick={() => onSelectAppointment?.(appointment)}
                          aria-label={`Ver cita de ${appointment?.lead_name || "Interesado"}`}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "7px 8px",
                            border: "1px solid #dfe8ef",
                            borderRadius: "8px",
                            background: "#f5f9fc",
                            overflow: "hidden",
                            textAlign: "left",
                            cursor: "pointer",
                            font: "inherit",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              color: "#3d6285",
                              fontSize: "8px",
                              fontWeight: 800,
                              letterSpacing: ".06em",
                            }}
                          >
                            {startTime}
                          </span>
                          <strong
                            style={{
                              display: "block",
                              marginTop: "3px",
                              color: "#34414e",
                              fontSize: "9px",
                              lineHeight: 1.25,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {appointment?.lead_name || "Interesado"}
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function OwnerAgendaAppointmentModal({
  appointment,
  notes,
  notesLoading,
  notesError,
  onClose,
}) {
  const appointmentDate = appointment?.appointment_date
    ? new Date(`${appointment.appointment_date}T00:00:00`)
    : null;

  const formattedDate = appointmentDate
    ? new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(appointmentDate)
    : "Fecha no disponible";

  const startTime = appointment?.start_time
    ? appointment.start_time.slice(0, 5)
    : "Sin horario";

  const endTime = appointment?.end_time
    ? appointment.end_time.slice(0, 5)
    : "";

  const timeLabel = endTime ? `${startTime} — ${endTime}` : startTime;
  const status = appointment?.appointment_status || "Sin estado";
  const statusIsInactive = ["Cancelada", "Completada"].includes(status);

  return (
    <div className="owner-modal-backdrop" onMouseDown={onClose}>
      <div
        className="owner-modal"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxWidth: "760px", maxHeight: "calc(100vh - 48px)", overflowY: "auto" }}
      >
        <div className="owner-modal-header">
          <div>
            <span className="owner-eyebrow">AGENDA · SOLO CONSULTA</span>
            <h2>Detalle de la cita</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div style={{ padding: "0 28px 28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              padding: "18px 0 22px",
              borderBottom: "1px solid #edf0f3",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  marginBottom: "5px",
                  color: "#8894a0",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: ".12em",
                }}
              >
                INTERESADO
              </span>
              <h3
                style={{
                  margin: 0,
                  color: "#26333f",
                  fontSize: "24px",
                  lineHeight: 1.15,
                }}
              >
                {appointment?.lead_name || "Interesado sin nombre"}
              </h3>
            </div>

            <span
              style={{
                flexShrink: 0,
                padding: "7px 11px",
                borderRadius: "999px",
                background: statusIsInactive ? "#f2f4f6" : "#eef7fd",
                color: statusIsInactive ? "#697581" : "#2473a6",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {status}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "12px",
              marginTop: "20px",
            }}
          >
            {[
              ["FECHA", formattedDate],
              ["HORARIO", timeLabel],
              ["ASESOR", appointment?.advisor_name || "Sin asesor"],
              ["TIPO DE CITA", appointment?.appointment_type || appointment?.type || "Sin tipo"],
              ["ORIGEN", appointment?.source || "manual"],
              ["UBICACIÓN", appointment?.location || "Sin ubicación"],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: "14px 15px",
                  border: "1px solid #edf0f3",
                  borderRadius: "12px",
                  background: "#fafbfc",
                }}
              >
                <span
                  style={{
                    display: "block",
                    marginBottom: "7px",
                    color: "#8a96a1",
                    fontSize: "9px",
                    fontWeight: 800,
                    letterSpacing: ".1em",
                  }}
                >
                  {label}
                </span>
                <strong
                  style={{
                    display: "block",
                    color: "#36434f",
                    fontSize: "12px",
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>

          {appointment?.source === "automation" && (
            <div
              style={{
                marginTop: "16px",
                padding: "15px 16px",
                border: "1px solid #e5edf3",
                borderRadius: "12px",
                background: "#f7fbff",
              }}
            >
              <span
                className="owner-panel-eyebrow"
                style={{ display: "block", marginBottom: "10px" }}
              >
                INFORMACIÓN DE AUTOMATIZACIÓN
              </span>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                {[
                  ["TIPO DE AUTOMATIZACIÓN", appointment?.automation_type || "Sin especificar"],
                  ["CICLO", appointment?.automation_cycle_id || "No asignado"],
                  ["PLAN DE SERVICIO", appointment?.service_plan_id || "No asignado"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span
                      style={{
                        display: "block",
                        marginBottom: "5px",
                        color: "#8a96a1",
                        fontSize: "9px",
                        fontWeight: 800,
                        letterSpacing: ".1em",
                      }}
                    >
                      {label}
                    </span>
                    <strong
                      style={{
                        display: "block",
                        color: "#36434f",
                        fontSize: "11px",
                        lineHeight: 1.45,
                        wordBreak: "break-word",
                      }}
                    >
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "24px" }}>
            <div style={{ marginBottom: "12px" }}>
              <span className="owner-panel-eyebrow">NOTAS</span>
              <h3 style={{ margin: "4px 0 0", color: "#33404c", fontSize: "18px" }}>
                Historial de observaciones de esta cita
              </h3>
              <p style={{ margin: "5px 0 0", color: "#7f8b96", fontSize: "11px" }}>
                Este historial pertenece exclusivamente a la cita y es independiente del seguimiento del interesado.
              </p>
            </div>

            <div
              style={{
                padding: "15px 16px",
                border: "1px solid #edf0f3",
                borderRadius: "12px",
                background: "#fafbfc",
              }}
            >
              <span
                style={{
                  display: "block",
                  marginBottom: "7px",
                  color: "#7e8994",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: ".1em",
                }}
              >
                NOTA ACTUAL
              </span>
              <p style={{ margin: 0, color: "#4e5a65", fontSize: "12px", lineHeight: 1.6 }}>
                {appointment?.notes || "Sin notas registradas."}
              </p>
            </div>

            <div style={{ marginTop: "15px" }}>
              {notesError ? (
                <div className="owner-data-error" role="alert">
                  {notesError}
                </div>
              ) : notesLoading ? (
                <OwnerEmptyState
                  compact
                  icon="□"
                  title="Cargando historial"
                  text="Consultando las observaciones registradas para esta cita."
                />
              ) : notes.length > 0 ? (
                <div style={{ display: "grid", gap: "0", paddingLeft: "4px" }}>
                  {notes.map((entry, index) => {
                    const noteDate = entry?.created_at
                      ? new Date(entry.created_at)
                      : null;
                    const dateLabel = noteDate
                      ? new Intl.DateTimeFormat("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }).format(noteDate)
                      : "Fecha no disponible";
                    const timeLabel = noteDate
                      ? new Intl.DateTimeFormat("es-MX", {
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(noteDate)
                      : "";

                    return (
                      <div
                        key={entry.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "18px minmax(0, 1fr)",
                          gap: "10px",
                          paddingBottom: index === notes.length - 1 ? "0" : "18px",
                          position: "relative",
                        }}
                      >
                        <div style={{ position: "relative", zIndex: 1, paddingTop: "4px" }}>
                          <span
                            style={{
                              display: "block",
                              width: "9px",
                              height: "9px",
                              margin: "0 auto",
                              border: "2px solid #168ee5",
                              borderRadius: "50%",
                              background: "#fff",
                              boxSizing: "border-box",
                            }}
                          />
                          {index !== notes.length - 1 && (
                            <span
                              style={{
                                position: "absolute",
                                top: "12px",
                                bottom: "-5px",
                                left: "8px",
                                width: "1px",
                                background: "#dfe7ed",
                              }}
                            />
                          )}
                        </div>

                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: "12px",
                            }}
                          >
                            <strong style={{ color: "#52606b", fontSize: "11px" }}>
                              Observación
                            </strong>
                            <span style={{ color: "#8b96a0", fontSize: "10px", whiteSpace: "nowrap" }}>
                              {dateLabel} · {timeLabel}
                            </span>
                          </div>
                          <p style={{ margin: "6px 0 0", color: "#5d6974", fontSize: "12px", lineHeight: 1.6 }}>
                            {entry.note}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    padding: "15px 16px",
                    border: "1px dashed #d9e1e7",
                    borderRadius: "11px",
                    color: "#7e8994",
                    fontSize: "12px",
                  }}
                >
                  Aún no hay historial de notas para esta cita.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "24px",
              paddingTop: "18px",
              borderTop: "1px solid #edf0f3",
            }}
          >
            <button
              type="button"
              className="owner-button secondary"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OwnerAppointments({
  filter,
  setFilter,
  appointments,
  loading,
  error,
  onSelectAppointment,
}) {
  const filters = [
    "Todas",
    "Pendientes",
    "Confirmadas",
    "Pospuestas",
    "Canceladas",
    "Completadas",
  ];

  const statusByFilter = {
    Pendientes: "Pendiente",
    Confirmadas: "Confirmada",
    Pospuestas: "Pospuesta",
    Canceladas: "Cancelada",
    Completadas: "Completada",
  };

  const filteredAppointments =
    filter === "Todas"
      ? appointments
      : appointments.filter(
          (appointment) =>
            appointment?.appointment_status === statusByFilter[filter]
        );

  const formatAppointmentDate = (dateValue) => {
    if (!dateValue) return "Sin fecha";

    const date = new Date(`${dateValue}T00:00:00`);

    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const formatAppointmentTime = (appointment) => {
    if (!appointment?.start_time) return "Sin horario";

    const start = appointment.start_time.slice(0, 5);
    const end = appointment?.end_time
      ? appointment.end_time.slice(0, 5)
      : "";

    return end ? `${start} — ${end}` : start;
  };

  const formatSource = (source) => {
    if (source === "automation") return "Automática";
    if (source === "manual") return "Manual";
    return source || "Sin origen";
  };

  const formatAutomation = (appointment) => {
    if (appointment?.source !== "automation") return "—";
    return appointment?.automation_type || "Sin tipo";
  };

  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">CONSULTA</span>
          <h2>Citas</h2>
          <p>
            Consulta las citas de todos los asesores. La administración no modifica las citas desde este módulo.
          </p>
        </div>
      </div>

      <div className="owner-filter-row">
        {filters.map((item) => (
          <button
            type="button"
            key={item}
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="owner-panel-card owner-appointments-table">
        {error ? (
          <div className="owner-data-error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <OwnerEmptyState
            compact
            icon="□"
            title="Cargando citas"
            text="Consultando las citas reales registradas en Supabase."
          />
        ) : filteredAppointments.length === 0 ? (
          <OwnerEmptyState
            compact
            icon="◷"
            title="No hay citas registradas"
            text={
              filter === "Todas"
                ? "Las citas aparecerán aquí cuando los asesores comiencen a registrar actividad."
                : "No hay citas que correspondan al filtro seleccionado."
            }
          />
        ) : (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <div
              style={{
                minWidth: "1180px",
              }}
            >
              <div
                className="owner-table-header"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.45fr 1.4fr 1.35fr 1fr 1.15fr 1.5fr 1fr 1.25fr 0.95fr",
                  gap: "12px",
                  minWidth: "1280px",
                }}
              >
                <span>FECHA</span>
                <span>INTERESADO</span>
                <span>ASESOR</span>
                <span>HORARIO</span>
                <span>ESTADO</span>
                <span>TIPO</span>
                <span>UBICACIÓN</span>
                <span>ORIGEN</span>
                <span>AUTOMATIZACIÓN</span>
                <span>HISTORIAL</span>
              </div>

              {filteredAppointments.map((appointment) => (
                <button
                  type="button"
                  key={appointment?.appointment_id}
                  onClick={() => onSelectAppointment?.(appointment)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.45fr 1.4fr 1.35fr 1fr 1.15fr 1.5fr 1fr 1.25fr 0.95fr",
                    width: "100%",
                    minWidth: "1280px",
                    alignItems: "center",
                    gap: "12px",
                    padding: "16px 22px",
                    border: 0,
                    borderTop: "1px solid #edf0f3",
                    background: "#fff",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <span>{formatAppointmentDate(appointment?.appointment_date)}</span>
                  <strong>{appointment?.lead_name || "Interesado"}</strong>
                  <span>{appointment?.advisor_name || "Sin asesor"}</span>
                  <span>{formatAppointmentTime(appointment)}</span>
                  <span>{appointment?.appointment_status || "Sin estado"}</span>
                  <span>
                    {appointment?.appointment_type || appointment?.type || "Sin tipo"}
                  </span>
                  <span>{appointment?.location || "Sin ubicación"}</span>
                  <span>{formatSource(appointment?.source)}</span>
                  <span>{formatAutomation(appointment)}</span>
                  <span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectAppointment?.(appointment);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelectAppointment?.(appointment);
                        }
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "32px",
                        padding: "6px 10px",
                        border: "1px solid #dfe6ec",
                        borderRadius: "8px",
                        background: "#f8fafb",
                        color: "#356f98",
                        fontSize: "11px",
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Ver historial
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OwnerSettings({ profile, initials }) {
  return (
    <section className="owner-page">
      <div className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">SISTEMA</span>
          <h2>Configuración</h2>
          <p>Información de la cuenta administrativa y parámetros generales.</p>
        </div>
      </div>

      <div className="owner-settings-grid">
        <div className="owner-panel-card owner-profile-card">
          <div className="owner-settings-avatar">{initials}</div>
          <div>
            <span className="owner-panel-eyebrow">CUENTA ACTUAL</span>
            <h3>{profile?.full_name || "Administrador"}</h3>
            <p>Administrador del sistema</p>
          </div>
        </div>

        <div className="owner-panel-card">
          <div className="owner-panel-heading">
            <div>
              <span className="owner-panel-eyebrow">PERFIL</span>
              <h3>Datos administrativos</h3>
            </div>
          </div>
          <div className="owner-settings-list">
            <div><span>Nombre</span><strong>{profile?.full_name || "—"}</strong></div>
            <div><span>Teléfono</span><strong>{profile?.phone || "—"}</strong></div>
            <div><span>Rol</span><strong>Administrador</strong></div>
            <div><span>Estado</span><strong className="owner-status-active">Activo</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OwnerEmptyState({ icon, title, text, actionLabel, onAction, compact = false }) {
  return (
    <div className={`owner-empty-state ${compact ? "compact" : ""}`}>
      <div className="owner-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && (
        <button type="button" className="owner-button secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function OwnerVisualModal({ eyebrow, title, onClose, children }) {
  return (
    <div className="owner-modal-backdrop" onMouseDown={onClose}>
      <div className="owner-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="owner-modal-header">
          <div>
            <span className="owner-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OwnerField({ label, placeholder, type = "text" }) {
  return (
    <label className="owner-field">
      <span>{label}</span>
      <input type={type} placeholder={placeholder} disabled />
    </label>
  );
}

export default OwnerPanel;
