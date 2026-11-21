/* ============================================================
   SimulaMed — app.js (V22 - Definitivo Completo)
   ============================================================ */
(function () {
  "use strict";

  const WHATSAPP = "584243260735";
  const ACCESS_SECRET = "SimulaMed-UCV-2026-claveMaestra-X9F2";
  
  const KEYS = {
    users: "sm_users_v1", session: "sm_session_v1", access: "sm_access_v1",
    progress: "sm_progress_v1", history: "sm_history_v1", failed: "sm_failed_v1", plan: "sm_plan_v1"
  };

  const $ = (id) => document.getElementById(id);
  const readJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? f; } catch { return f; } };
  const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");

  async function hashPwd(password, salt) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + password));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function genSalt() {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function hmac(message, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  let allQuestions = [], filtered = [], currentIdx = 0, selectedAnswer = null, diasSeleccionados = [];

  function cargarPreguntas() {
    try {
      const raw = document.getElementById("embeddedQuestionBank")?.textContent || "{}";
      const arr = (JSON.parse(raw)).preguntas || [];
      allQuestions = arr.map(q => ({
        id: q.id, area_grupo: q.area_grupo, area_nombre: q.area_nombre,
        especialidad: q.especialidad, subtema: q.subtema, tipo: q.tipo || "",
        dificultad: q.dificultad || "Intermedio", pregunta: q.enunciado || q.pregunta || "",
        opciones: q.opciones || [],
        respuesta_correcta: (q.respuesta_correcta !== undefined) ? q.respuesta_correcta : q.respuesta_correcta_indice,
        explicacion: q.justificacion || q.explicacion || "", perla_clinica: q.perla_clinica || ""
      })).filter(q => q.pregunta && q.opciones.length);
      console.log("✅ Preguntas cargadas:", allQuestions.length);
    } catch (e) { console.error("❌ Error cargando preguntas:", e); }
  }

  function getUsers() { return readJSON(KEYS.users, {}); }
  function saveUsers(u) { writeJSON(KEYS.users, u); }
  function getSession() { return readJSON(KEYS.session, null); }
  function saveSession(s) { writeJSON(KEYS.session, s); }
  function clearSession() { localStorage.removeItem(KEYS.session); }

  function setAuthMsg(type, text) {
    const el = $("authMessage"); if (!el) return;
    el.className = "alert " + type + " mt-2"; el.textContent = text; show(el);
  }

  function showLoginMode() {
    if($("authTitle")) $("authTitle").textContent = "Iniciar Sesión";
    if($("authSubtitle")) $("authSubtitle").textContent = "Ingresa tus datos y tu código de activación.";
    hide($("registerFields")); show($("btnSignIn")); show($("btnShowRegister"));
    hide($("btnSignUp")); hide($("btnCancelRegister")); hide($("authMessage"));
  }

  function showRegisterMode() {
    if($("authTitle")) $("authTitle").textContent = "Crear Cuenta";
    if($("authSubtitle")) $("authSubtitle").textContent = "Completa tus datos y usa tu código de activación.";
    show($("registerFields")); hide($("btnSignIn")); hide($("btnShowRegister"));
    show($("btnSignUp")); show($("btnCancelRegister")); hide($("authMessage"));
  }

  async function signUp() {
    const email = ($("loginEmail")?.value || "").trim().toLowerCase();
    const pwd = $("loginPassword")?.value || "";
    const code = ($("loginCode")?.value || "").trim().toUpperCase();
    const fname = ($("regFirstName")?.value || "").trim(), lname = ($("regLastName")?.value || "").trim();
    const age = ($("regAge")?.value || "").trim(), sex = ($("regSex")?.value || "").trim();
    const cedula = ($("regCedula")?.value || "").trim(), phone = ($("regPhone")?.value || "").trim();

    if (!fname || !lname || !age || !sex || !cedula || !phone) return setAuthMsg("err", "Completa todos los datos personales.");
    if (!email.includes("@")) return setAuthMsg("err", "Correo inválido.");
    if (pwd.length < 6) return setAuthMsg("err", "La contraseña debe tener al menos 6 caracteres.");
    if (!code) return setAuthMsg("err", "Debes ingresar tu código de activación.");
    
    const hashCode = await hmac(email + "|30", ACCESS_SECRET);
    const expectedCode = "SM-" + hashCode.slice(0, 16).toUpperCase().match(/.{1,4}/g).join("-");
    if (code !== expectedCode) return setAuthMsg("err", "El código es inválido o no corresponde a este correo.");

    const users = getUsers();
    if (users[email]) return setAuthMsg("err", "Este correo ya está registrado. Inicia sesión.");
    
    const salt = genSalt(); const hashPass = await hashPwd(pwd, salt);
    users[email] = { email, salt, hash: hashPass, fname, lname, age, sex, cedula, phone, createdAt: Date.now() };
    saveUsers(users); saveSession({ email });
    
    const now = Date.now();
    writeJSON(KEYS.access, { code: expectedCode, email, days: 30, activatedAt: now, expiresAt: now + 30 * 86400000 });
    setAuthMsg("ok", "Cuenta y acceso activados. Entrando...");
    setTimeout(() => { updateHeader(); showSection("bank"); }, 800);
  }

  async function signIn() {
    const email = ($("loginEmail")?.value || "").trim().toLowerCase();
    const pwd = $("loginPassword")?.value || "";
    const code = ($("loginCode")?.value || "").trim().toUpperCase();
    
    if (!email.includes("@")) return setAuthMsg("err", "Correo inválido.");
    if (!pwd) return setAuthMsg("err", "Ingresa tu contraseña.");
    if (!code) return setAuthMsg("err", "Debes ingresar tu código de activación.");
    
    const hashCode = await hmac(email + "|30", ACCESS_SECRET);
    const expectedCode = "SM-" + hashCode.slice(0, 16).toUpperCase().match(/.{1,4}/g).join("-");
    if (code !== expectedCode) return setAuthMsg("err", "El código es inválido o no corresponde a este correo.");

    const users = getUsers(); const u = users[email];
    if (!u) return setAuthMsg("err", "Cuenta no encontrada.");
    
    const hashPass = await hashPwd(pwd, u.salt);
    if (hashPass !== u.hash) return setAuthMsg("err", "Contraseña incorrecta");
    
    saveSession({ email });
    const now = Date.now();
    writeJSON(KEYS.access, { code: expectedCode, email, days: 30, activatedAt: now, expiresAt: now + 30 * 86400000 });
    setAuthMsg("ok", "Acceso verificado. Entrando...");
    setTimeout(() => { updateHeader(); showSection("bank"); }, 600);
  }

  function logout() { clearSession(); updateHeader(); showSection("auth"); showLoginMode(); }

  function getAccess() { return readJSON(KEYS.access, null); }
  function isAccessActive() { const a = getAccess(); return a && a.expiresAt && Date.now() < a.expiresAt; }
  function daysLeft() { const a = getAccess(); if (!a || !a.expiresAt) return 0; return Math.max(0, Math.ceil((a.expiresAt - Date.now()) / 86400000)); }

  function showSection(name) {
    ["auth", "subscription", "bank"].forEach(s => {
      const el = $(s === "auth" ? "authSection" : s === "subscription" ? "subscriptionSection" : "bankSection");
      if (el) hide(el);
    });
    if (name === "auth") show($("authSection"));
    else if (name === "subscription") show($("subscriptionSection"));
    else if (name === "bank") { show($("bankSection")); checkAccess(); }
  }

  function checkAccess() {
    const session = getSession(); const active = isAccessActive();
    if (!session) { showSection("auth"); return; }
    if (!active) { show($("paywallBanner")); hide($("bankUnlockedContent")); return; }
    hide($("paywallBanner")); show($("bankUnlockedContent"));
    renderQuestions(); renderPersonalStats();
  }

    function updateHeader() {
    const session = getSession();
    const active = isAccessActive();
    const days = daysLeft();
    
    if ($("headerUserStatus")) {
      $("headerUserStatus").textContent = session ? "Sesión: " + session.email : "Sesión: No iniciada";
    }

    const statusEl = $("headerSubStatus");
    if (statusEl) {
      if (active) {
        statusEl.textContent = `⏳ Te quedan ${days} días de suscripción`;
        statusEl.style.background = "#16a34a"; // Verde si está activo
      } else if (session) {
        statusEl.textContent = `⚠️ Tu suscripción ha vencido`;
        statusEl.style.background = "#dc2626"; // Rojo si venció
      } else {
        statusEl.textContent = `Suscríbete para acceder`;
        statusEl.style.background = "#475569"; // Gris si no hay sesión
      }
    }

    if (session) show($("btnLogout")); else hide($("btnLogout"));
    
    if ($("subDaysRemaining")) {
      $("subDaysRemaining").textContent = active ? `Acceso activo: ${days} días restantes.` : "";
    }
    
    updateWhatsapp();
  }

  function updateWhatsapp() {
    const session = getSession(); const info = session ? session.email : "";
    const msg = encodeURIComponent(info ? `Hola, soy ${info}. Quiero activar/renovar SimulaMed.` : "Hola, quiero información de SimulaMed.");
    const url = `https://wa.me/${WHATSAPP}?text=${msg}`;
    ["headerWhatsappLink", "authWhatsappLink", "subWhatsappLink", "bannerWhatsappLink"].forEach(id => {
      const el = $(id); if (el) el.href = url;
    });
  }

  function populateFilters() {
    const areaSel = $("filterArea"), specSel = $("filterSpecialty");
    if (areaSel) {
      const map = new Map(); allQuestions.forEach(q => q.area_grupo && map.set(q.area_grupo, q.area_nombre));
      areaSel.innerHTML = '<option value="ALL">Todas las áreas</option>';
      map.forEach((label, key) => { const o = document.createElement("option"); o.value = key; o.textContent = label; areaSel.appendChild(o); });
      areaSel.onchange = applyFilters;
    }
    if (specSel) {
      const specs = [...new Set(allQuestions.map(q => q.especialidad))].sort();
      specSel.innerHTML = '<option value="ALL">Todas las especialidades</option>';
      specs.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; specSel.appendChild(o); });
      specSel.onchange = applyFilters;
    }
    if ($("filterDifficulty")) $("filterDifficulty").onchange = applyFilters;
    if ($("filterSearch")) $("filterSearch").oninput = applyFilters;
    if ($("countTotalQ")) $("countTotalQ").textContent = allQuestions.length;
    if ($("countTotalAreas")) $("countTotalAreas").textContent = new Set(allQuestions.map(q => q.especialidad)).size;
  }

  function applyFilters() {
    const area = $("filterArea")?.value || "ALL", spec = $("filterSpecialty")?.value || "ALL";
    const diff = $("filterDifficulty")?.value || "ALL", search = ($("filterSearch")?.value || "").trim().toLowerCase();
    filtered = allQuestions.filter(q => {
      if (area !== "ALL" && q.area_grupo !== area) return false;
      if (spec !== "ALL" && q.especialidad !== spec) return false;
      if (diff !== "ALL" && q.dificultad !== diff) return false;
      if (search && !`${q.pregunta} ${q.subtema} ${q.especialidad}`.toLowerCase().includes(search)) return false;
      return true;
    });
    currentIdx = 0; selectedAnswer = null;
    if ($("filteredCountPill")) $("filteredCountPill").textContent = `${filtered.length} resultados`;
    renderQuestions();
  }

  function renderQuestions() {
    const viewer = $("questionViewer"); if (!viewer) return;
    if (!filtered.length) { viewer.innerHTML = '<p class="muted">No hay preguntas.</p>'; return; }
    const q = filtered[currentIdx];
    let html = `<div class="q-meta"><span class="chip">${q.especialidad}</span><span class="chip">${q.dificultad}</span>${q.tipo ? `<span class="chip">${q.tipo}</span>` : ""}<span class="chip">${currentIdx + 1} / ${filtered.length}</span></div><div class="q-stem">${q.pregunta}</div><div class="options-list">`;
    q.opciones.forEach((opt, i) => {
      let cls = "opt-btn";
      if (selectedAnswer !== null) { if (i === q.respuesta_correcta) cls += " correct"; else if (i === selectedAnswer) cls += " incorrect"; }
      html += `<button type="button" class="${cls}" data-idx="${i}">${String.fromCharCode(65+i)}. ${opt}</button>`;
    });
    html += `</div>`;
    if (selectedAnswer !== null) {
      html += `<div class="feedback-box"><strong>Explicación:</strong><p>${q.explicacion}</p>`;
      if (q.perla_clinica) html += `<p class="pearl">💡 ${q.perla_clinica}</p>`;
      html += `</div>`;
    }
    viewer.innerHTML = html;
    viewer.querySelectorAll(".opt-btn").forEach(btn => btn.onclick = () => selectAnswer(parseInt(btn.dataset.idx, 10)));
  }

  function selectAnswer(idx) {
    if (selectedAnswer !== null) return;
    const q = filtered[currentIdx]; selectedAnswer = idx;
    const ok = idx === q.respuesta_correcta;
    const p = readJSON(KEYS.progress, { answered: 0, correct: 0, streak: 0, bestStreak: 0, points: 0 });
    p.answered += 1;
    if (ok) { p.correct += 1; p.streak += 1; p.bestStreak = Math.max(p.bestStreak, p.streak); p.points += 10 + p.streak * 2; }
    else { p.streak = 0; p.points = Math.max(0, p.points - 3); }
    writeJSON(KEYS.progress, p); renderQuestions(); renderPersonalStats();
  }

  function nextQ() { if (filtered.length) { currentIdx = (currentIdx + 1) % filtered.length; selectedAnswer = null; renderQuestions(); } }
  function prevQ() { if (filtered.length) { currentIdx = (currentIdx - 1 + filtered.length) % filtered.length; selectedAnswer = null; renderQuestions(); } }
  function randomQ() { if (filtered.length) { currentIdx = Math.floor(Math.random() * filtered.length); selectedAnswer = null; renderQuestions(); } }
  function clearFilters() {
    if ($("filterArea")) $("filterArea").value = "ALL"; if ($("filterSpecialty")) $("filterSpecialty").value = "ALL";
    if ($("filterDifficulty")) $("filterDifficulty").value = "ALL"; if ($("filterSearch")) $("filterSearch").value = "";
    applyFilters();
  }

  function renderPersonalStats() {
    const p = readJSON(KEYS.progress, { answered: 0, correct: 0, streak: 0, bestStreak: 0, points: 0 });
    if ($("statAnswered")) $("statAnswered").textContent = p.answered; if ($("statCorrect")) $("statCorrect").textContent = p.correct;
    if ($("statAccuracy")) $("statAccuracy").textContent = p.answered ? ((p.correct/p.answered)*100).toFixed(1) + "%" : "0.0%";
    if ($("statStreak")) $("statStreak").textContent = `${p.streak} / ${p.bestStreak}`; if ($("statPoints")) $("statPoints").textContent = p.points + " pts";
    const tbody = $("personalProgressRows");
    if (tbody) {
      const nivel = p.points < 100 ? "Principiante" : p.points < 500 ? "Intermedio" : "Avanzado";
      tbody.innerHTML = `<tr><td>Preguntas respondidas</td><td>${p.answered}</td><td>—</td></tr><tr><td>Aciertos</td><td>${p.correct}</td><td>—</td></tr><tr><td>Precisión</td><td>${p.answered ? ((p.correct/p.answered)*100).toFixed(1) + "%" : "0%"}</td><td>${p.answered > 50 ? "Buen ritmo" : "Sigue practicando"}</td></tr><tr><td>Racha máxima</td><td>${p.bestStreak}</td><td>—</td></tr><tr><td>Nivel</td><td>${p.points} pts</td><td>${nivel}</td></tr>`;
    }
    renderInteruserRank();
  }

  function renderInteruserRank() {
    const tbody = $("interuserRankRows"); if (!tbody) return;
    const session = getSession(), p = readJSON(KEYS.progress, { answered: 0, correct: 0, points: 0 }), users = getUsers();
    const rows = Object.keys(users).map(email => ({
      email, me: session && session.email === email,
      answered: session && session.email === email ? p.answered : 0,
      acc: session && session.email === email && p.answered ? ((p.correct/p.answered)*100).toFixed(1) + "%" : "—",
      pts: session && session.email === email ? p.points : 0
    })).sort((a,b) => b.pts - a.pts);
    tbody.innerHTML = rows.map((r, i) => `<tr class="${r.me ? "rank-row-me" : ""}"><td>${i+1}</td><td>${r.email}</td><td>${r.answered}</td><td>${r.acc}</td><td>${r.pts}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Sin usuarios.</td></tr>';
  }

  function resetProgress() {
    if (!confirm("¿Reiniciar todo tu progreso?")) return;
    writeJSON(KEYS.progress, { answered: 0, correct: 0, streak: 0, bestStreak: 0, points: 0 });
    writeJSON(KEYS.failed, []); writeJSON(KEYS.history, []); renderPersonalStats();
  }

  function bindTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active")); btn.classList.add("active");
        const tab = btn.dataset.tab;
        ["questions","personalRank","interuserRank","biblioteca","calendario","protocolos"].forEach(t => hide($("subtab-" + t)));
        show($("subtab-" + tab));
        if (tab === "personalRank" || tab === "interuserRank") renderPersonalStats();
      };
    });

    // Calendario
    const celdas = document.querySelectorAll(".dia-celda");
    const selectHorario = $("selectHorario");
    const btnGuardar = $("btnGuardarPlan");
    const planGuardado = readJSON(KEYS.plan, null);
    if (planGuardado) {
      diasSeleccionados = planGuardado.dias || [];
      if (selectHorario && planGuardado.horario) selectHorario.value = planGuardado.horario;
      celdas.forEach(celda => {
        if (diasSeleccionados.includes(celda.dataset.dia)) {
          celda.style.background = "#dbeafe"; celda.style.color = "#1e3a8a";
          celda.innerHTML = `📚<br><span style="font-size: 0.7rem; font-weight: bold;">${planGuardado.horario}</span>`;
        }
      });
    }
    celdas.forEach(celda => {
      celda.onclick = () => {
        const dia = celda.dataset.dia;
        if (diasSeleccionados.includes(dia)) {
          diasSeleccionados = diasSeleccionados.filter(d => d !== dia);
          celda.style.background = "#f8fafc"; celda.style.color = "#94a3b8"; celda.innerHTML = "➕";
        } else {
          diasSeleccionados.push(dia); celda.style.background = "#dbeafe"; celda.style.color = "#1e3a8a";
          celda.innerHTML = `📚<br><span style="font-size: 0.7rem; font-weight: bold;">${selectHorario.value.split(" ")[0]}</span>`;
        }
      };
    });
    if (selectHorario) {
      selectHorario.onchange = () => {
        celdas.forEach(celda => {
          if (diasSeleccionados.includes(celda.dataset.dia)) {
            celda.innerHTML = `📚<br><span style="font-size: 0.7rem; font-weight: bold;">${selectHorario.value.split(" ")[0]}</span>`;
          }
        });
      };
    }
    if (btnGuardar) {
      btnGuardar.onclick = () => {
        if (diasSeleccionados.length === 0) return alert("Selecciona al menos un día.");
        writeJSON(KEYS.plan, { dias: diasSeleccionados, horario: selectHorario.value });
        alert("✅ Tu plan de estudio ha sido guardado.");
      };
    }

    // Protocolos
    const protocolosData = [
      { area: "Cardiología", titulo: "Síndrome Coronario Agudo (SCA)", color: "#dc2626", fuente: "ACC/AHA 2025", pasos: ["1. AAS: 162-325 mg masticados (carga), luego 81 mg/día.", "2. Ticagrelor 180 mg VO (carga) + 90 mg c/12h, o Clopidogrel 600 mg VO (carga) + 75 mg/día.", "3. Enoxaparina 1 mg/kg SC c/12h o Heparina 60 UI/kg IV + infusión 12 UI/kg/h.", "4. Atorvastatina 80 mg/día o Rosuvastatina 20-40 mg/día.", "5. Metoprolol 25-50 mg VO c/6-12h (si no hay contraindicación)."] },
      { area: "Cardiología", titulo: "Crisis Hipertensiva", color: "#ea580c", fuente: "ACC/AHA 2025", pasos: ["1. Emergencia: Labetalol 20-80 mg IV o Nicardipino 5 mg/h IV.", "2. Objetivo: Reducir PAM 25% en 1ra hora. Esmolol 500 mcg/kg IV en disección.", "3. Urgencia: Captopril 25 mg VO o Amlodipino 5-10 mg VO.", "4. Evitar Nifedipino sublingual."] },
      { area: "Cardiología", titulo: "Insuficiencia Cardíaca", color: "#2563eb", fuente: "ACC/AHA 2025", pasos: ["1. Sacubitrilo/Valsartán 50 mg c/12h (subir a 200 mg).", "2. Carvedilol 3.125 mg c/12h o Bisoprolol 1.25 mg/día.", "3. Espironolactona 12.5-25 mg/día.", "4. Dapagliflozina 10 mg/día.", "5. Furosemida 20-40 mg VO/IV."] },
      { area: "Endocrinología", titulo: "Cetoacidosis Diabética", color: "#7c3aed", fuente: "ADA 2026", pasos: ["1. SF 0.9% 1-1.5 L en 1ra hora, luego 250-500 mL/h.", "2. Insulina Rápida IV 0.1 U/kg/h.", "3. KCl 20-30 mEq/L si K+ < 5.5.", "4. Dextrosa 5% + Insulina 0.05 U/kg/h cuando glucemia <250.", "5. Bicarbonato solo si pH < 6.9."] },
      { area: "Endocrinología", titulo: "Hipoglucemia", color: "#db2777", fuente: "ADA 2026", pasos: ["1. Consciente: Regla 15-15 (15 g de carbohidratos).", "2. Inconsciente: Glucagón 1 mg IM/SC o 3 mg intranasal.", "3. Si no hay glucagón: Dextrosa 50% 50 mL IV.", "4. Comida con carbohidratos complejos después."] },
      { area: "Neurología", titulo: "ECV Isquémico", color: "#0891b2", fuente: "AHA/ASA 2026", pasos: ["1. Alteplasa 0.9 mg/kg (máx 90 mg) o Tenecteplasa 0.25 mg/kg.", "2. Ventana: Hasta 4.5 horas.", "3. AAS 162-325 mg a las 24h post-trombólisis.", "4. Labetalol 10-20 mg IV si TA >220/120.", "5. Atorvastatina 80 mg/día."] },
      { area: "Cirugía", titulo: "Apendicitis Aguda", color: "#475569", fuente: "WSES 2025", pasos: ["1. Cefazolina 2 g IV + Metronidazol 500 mg IV.", "2. Apendicectomía laparoscópica.", "3. Manejo médico: Ceftriaxona 1-2 g IV c/24h + Metronidazol 500 mg c/8h.", "4. Analgesia: Ketorolaco 30 mg IV c/8h."] },
      { area: "Neumología", titulo: "Crisis Asmática", color: "#be123c", fuente: "GINA 2025", pasos: ["1. Salbutamol 5 mg + Ipratropio 0.5 mg nebulizados c/20 min.", "2. Prednisona 40-60 mg VO o Metilprednisolona 40-125 mg IV.", "3. Oxígeno para SatO2 93-95%.", "4. Sulfato de Magnesio 2 g IV en 20 min.", "5. Evitar sedantes."] },
      { area: "Nefrología", titulo: "Lesión Renal Aguda (LRA)", color: "#0f766e", fuente: "KDIGO 2026", pasos: ["1. Ringer Lactato 30 mL/kg si hipovolemia.", "2. Furosemida 20-40 mg IV solo si hay sobrecarga.", "3. Ajustar antibióticos y evitar AINEs.", "4. Diálisis si K+ >6.5, pH <7.1 o uremia.", "5. Monitorizar creatinina y diuresis."] },
      { area: "Infectología", titulo: "Sepsis y Shock Séptico", color: "#2563eb", fuente: "Surviving Sepsis 2021", pasos: ["1. Piperacilina-Tazobactam 4.5 g IV c/6h + Vancomicina 15-20 mg/kg IV.", "2. Cristaloides 30 mL/kg en 3 horas.", "3. Norepinefrina 0.05-2 mcg/kg/min (PAM >65).", "4. Hidrocortisona 200 mg/día si es refractario.", "5. Drenar foco quirúrgico."] },
      { area: "Neumología", titulo: "EPOC Exacerbado", color: "#0d9488", fuente: "GOLD 2026", pasos: ["1. Salbutamol 2.5 mg + Ipratropio 0.5 mg nebulizados c/4-6h.", "2. Prednisona 40 mg VO por 5 días.", "3. Antibiótico si hay esputo purulento (Amoxicilina-Clavulánico 875 mg VO c/12h).", "4. Ventilación no invasiva (VNI) si pH <7.35.", "5. Oxígeno para SatO2 88-92%."] },
      { area: "Neumología", titulo: "Edema Agudo de Pulmón", color: "#0284c7", fuente: "ESC 2023", pasos: ["1. Furosemida 40 mg IV en bolo.", "2. Nitroglicerina IV 10-20 mcg/min (titular).", "3. VNI (CPAP) si hay distrés.", "4. Morfina 2-4 mg IV (solo si hay ansiedad extrema).", "5. Sentar al paciente."] },
      { area: "Neurología", titulo: "Estado Epiléptico", color: "#9333ea", fuente: "AES 2025", pasos: ["1. Lorazepam 0.1 mg/kg IV (máx 4 mg) o Midazolam 10 mg IM.", "2. Fenitoína 20 mg/kg IV (máx 50 mg/min).", "3. Levetiracetam 60 mg/kg IV (máx 4500 mg).", "4. Si persiste: Midazolam en infusión.", "5. Proteger vía aérea."] },
      { area: "Trauma", titulo: "Politraumatizado (ATLS)", color: "#b91c1c", fuente: "ATLS 11 Edición", pasos: ["1. Vía aérea con control cervical.", "2. Ventilación y oxígeno.", "3. Circulación: 1L de cristaloides o Sangre (Protocolo de transfusión masiva).", "4. Ácido Tranexámico 1 g IV en <3h.", "5. Déficit neurológico y exposición."] }
    ];

    function renderProtocolos() {
      const contenedor = $("listaProtocolos");
      if (!contenedor) return;
      contenedor.innerHTML = protocolosData.map(p => `
        <div style="background: #fff; border-left: 5px solid ${p.color}; border-radius: 8px; padding: 1.5rem; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <span style="font-size: 0.75rem; font-weight: bold; color: ${p.color}; background: ${p.color}15; padding: 0.2rem 0.6rem; border-radius: 99px;">${p.area}</span>
          <h3 style="margin: 0.8rem 0; font-size: 1.1rem; color: #1e293b;">${p.titulo}</h3>
          <p style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.5rem;">Fuente: ${p.fuente}</p>
          <ul style="font-size: 0.9rem; color: #475569; line-height: 1.8; padding-left: 1rem;">
            ${p.pasos.map(paso => `<li>${paso}</li>`).join("")}
          </ul>
        </div>
      `).join("");
    }
    renderProtocolos();
  }
  document.addEventListener("DOMContentLoaded", () => {
    cargarPreguntas(); populateFilters();

    if ($("btnShowRegister")) $("btnShowRegister").onclick = showRegisterMode;
    if ($("btnCancelRegister")) $("btnCancelRegister").onclick = showLoginMode;
    if ($("btnSignIn")) $("btnSignIn").onclick = signIn;
    if ($("btnSignUp")) $("btnSignUp").onclick = signUp;
    if ($("btnLogout")) $("btnLogout").onclick = logout;
    
    if ($("btnShowAuthSection")) $("btnShowAuthSection").onclick = () => { showSection("auth"); showLoginMode(); };
    if ($("btnShowSubSection")) $("btnShowSubSection").onclick = () => showSection("subscription");
    if ($("btnShowBankSection")) $("btnShowBankSection").onclick = () => showSection("bank");

    if ($("btnPrevQ")) $("btnPrevQ").onclick = prevQ;
    if ($("btnNextQ")) $("btnNextQ").onclick = nextQ;
    if ($("btnRandomQ")) $("btnRandomQ").onclick = randomQ;
    if ($("btnClearFilters")) $("btnClearFilters").onclick = clearFilters;
    if ($("btnResetProgress")) $("btnResetProgress").onclick = resetProgress;

    bindTabs();
    
    updateHeader();
    const session = getSession();
    if (!session) { showSection("auth"); showLoginMode(); }
    else if (!isAccessActive()) showSection("subscription");
    else showSection("bank");
    
    applyFilters();
  });

})();