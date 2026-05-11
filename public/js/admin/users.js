(async function () {
  const { $, el, adminApiRequest } = window.AdminCommon;

  const els = {
    search: $('#users-search'),
    refresh: $('#users-refresh'),
    newBtn: $('#users-new'),
    error: $('#users-error'),
    tbody: $('#users-tbody'),

    form: $('#user-form'),
    id: $('#user-id'),
    username: $('#user-username'),
    email: $('#user-email'),
    phone: $('#user-phone'),
    whatsapp: $('#user-whatsapp'),
    active: $('#user-active'),
    blacklisted: $('#user-blacklisted'),
    admin: $('#user-admin'),
    role: $('#user-role'),
    passwordWrap: $('#user-password-wrap'),
    password: $('#user-password'),
    reset: $('#user-reset'),
    save: $('#user-save'),
    resetPassword: $('#user-reset-password'),

    passwordModal: $('#user-password-modal'),
    newPassword: $('#user-new-password'),
    passwordConfirm: $('#user-password-confirm'),
    passwordCancel: $('#user-password-cancel'),
  };

  function setError(msg) {
    if (!msg) {
      els.error.classList.add('hidden');
      els.error.textContent = '';
      return;
    }
    els.error.classList.remove('hidden');
    els.error.textContent = msg;
  }

  let users = [];
  let roles = [];

  function ensureRoleOptions() {
    if (!els.role) return;
    els.role.textContent = '';
    els.role.appendChild(el('option', { value: '', text: '（無）' }));
    for (const r of roles) {
      els.role.appendChild(el('option', { value: String(r.id), text: r.name }));
    }
  }

  async function loadRoles() {
    try {
      const out = await adminApiRequest('/api/admin/roles');
      roles = out.roles || [];
      ensureRoleOptions();
    } catch (e) {
      roles = [];
      ensureRoleOptions();
    }
  }

  function fillForm(u) {
    const isNew = !u || !u.id;
    els.id.value = isNew ? '' : String(u.id);
    els.username.value = u && u.username ? u.username : '';
    els.email.value = u && u.email ? u.email : '';
    els.phone.value = u && u.phone ? u.phone : '';
    els.whatsapp.value = u && u.whatsapp ? u.whatsapp : '';
    els.active.value = String(u && u.is_active !== undefined ? !!u.is_active : true);
    els.blacklisted.value = String(u && u.is_blacklisted !== undefined ? !!u.is_blacklisted : false);
    els.admin.value = String(u && u.is_admin !== undefined ? !!u.is_admin : false);
    if (els.role) els.role.value = u && u.role_id ? String(u.role_id) : '';
    els.password.value = '';
    els.passwordWrap.style.display = isNew ? '' : 'none';
  }

  function clearForm() {
    fillForm({ id: '', username: '', email: '', phone: '', whatsapp: '', is_active: true, is_blacklisted: false, is_admin: false });
  }

  async function loadUsers() {
    setError('');
    els.tbody.textContent = '';
    const params = new URLSearchParams();
    const search = (els.search.value || '').trim();
    if (search) params.set('search', search);
    const data = await adminApiRequest('/api/admin/users?' + params.toString());
    users = data.users || [];

    for (const u of users) {
      const status = (u.is_blacklisted ? '黑名單' : (u.is_active ? '啟用' : '停用'));
      const tr = el('tr', {}, [
        el('td', { text: String(u.id) }),
        el('td', { text: u.username || '' }),
        el('td', { text: u.email || '' }),
        el('td', { text: u.phone || '' }),
        el('td', { text: status }),
        el('td', { text: u.is_admin ? '是' : '否' }),
        el('td', { text: u.role_name || '' }),
        el('td', {}, [
          el('button', { class: 'admin-link-btn', text: '編輯', onclick: () => fillForm(u) }),
        ]),
      ]);
      els.tbody.appendChild(tr);
    }
  }

  els.form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setError('');
    els.save.disabled = true;
    try {
      const id = (els.id.value || '').trim();
      if (id) {
        await adminApiRequest('/api/admin/users/' + encodeURIComponent(id), {
          method: 'PUT',
          json: {
            email: (els.email.value || '').trim() || null,
            phone: (els.phone.value || '').trim() || null,
            whatsapp: (els.whatsapp.value || '').trim() || null,
            first_name: null,
            last_name: null,
            is_active: els.active.value === 'true',
            is_blacklisted: els.blacklisted.value === 'true',
            is_admin: els.admin.value === 'true',
            member_level_id: null,
            role_id: els.role && els.role.value ? Number(els.role.value) : null,
          },
        });
      } else {
        if (!els.password.value || els.password.value.length < 6) {
          throw new Error('新用戶密碼至少 6 位');
        }
        await adminApiRequest('/api/admin/users', {
          method: 'POST',
          json: {
            username: els.username.value.trim(),
            email: (els.email.value || '').trim() || null,
            phone: (els.phone.value || '').trim() || null,
            password: els.password.value,
            first_name: null,
            last_name: null,
            is_admin: els.admin.value === 'true',
            is_active: els.active.value === 'true',
            role_id: els.role && els.role.value ? Number(els.role.value) : null,
          },
        });
      }

      await loadUsers();
      clearForm();
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      els.save.disabled = false;
    }
  });

  els.resetPassword.addEventListener('click', async () => {
    const id = (els.id.value || '').trim();
    if (!id) {
      setError('請先揀一個用戶');
      return;
    }
    if (els.newPassword) els.newPassword.value = '';
    if (els.passwordModal) els.passwordModal.classList.remove('hidden');
  });

  if (els.passwordCancel) {
    els.passwordCancel.addEventListener('click', () => {
      if (els.passwordModal) els.passwordModal.classList.add('hidden');
    });
  }

  if (els.passwordConfirm) {
    els.passwordConfirm.addEventListener('click', async () => {
      const id = (els.id.value || '').trim();
      const pw = (els.newPassword && els.newPassword.value ? els.newPassword.value : '').trim();
      if (!id) return;
      if (!pw || pw.length < 6) {
        setError('密碼至少 6 位');
        return;
      }
      try {
        await adminApiRequest('/api/admin/users/' + encodeURIComponent(id) + '/password', {
          method: 'POST',
          json: { new_password: pw },
        });
        setError('');
        if (els.passwordModal) els.passwordModal.classList.add('hidden');
      } catch (e) {
        setError(e && e.message ? e.message : String(e));
      }
    });
  }

  els.reset.addEventListener('click', () => clearForm());
  els.refresh.addEventListener('click', () => loadUsers().catch((e) => setError(e.message)));
  els.newBtn.addEventListener('click', () => clearForm());
  els.search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') loadUsers().catch((e) => setError(e.message));
  });

  try {
    await loadRoles();
    await loadUsers();
    clearForm();
  } catch (e) {
    setError(e && e.message ? e.message : String(e));
  }
})();
