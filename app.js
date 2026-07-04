(function () {
  'use strict';

  var STORAGE_KEY = 'firewoodBooksData_v1';

  var EXPENSE_CATEGORIES = [
    'Supplies', 'Equipment/Tools', 'Vehicle & Fuel', 'Repairs & Maintenance',
    'Advertising', 'Permits & Licenses', 'Insurance', 'Other'
  ];

  var PAYMENT_METHODS = ['Cash', 'Check', 'Venmo', 'Zelle', 'Credit/Debit Card', 'Other'];

  var PRODUCT_SUGGESTIONS = [
    'Face cord — seasoned oak', 'Face cord — green oak', 'Full cord — mixed hardwood',
    'Half cord — seasoned', 'Bundle — kiln dried', 'Delivery fee'
  ];

  var state = null;
  var editingIds = { sale: null, expense: null, mileage: null, batch: null };
  var salesSortDir = 'desc';
  var expensesSortDir = 'desc';
  var currentReport = 'pnl';
  var toastTimer = null;

  // ---------------------------------------------------------------------
  // utilities
  // ---------------------------------------------------------------------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function money(n) {
    n = Number(n) || 0;
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function fmtDate(s) {
    if (!s) return '—';
    var parts = s.split('-').map(Number);
    var dt = new Date(parts[0], parts[1] - 1, parts[2]);
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function monthsSince(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var cut = new Date(parts[0], parts[1] - 1, parts[2]);
    var now = new Date();
    var months = (now.getFullYear() - cut.getFullYear()) * 12 + (now.getMonth() - cut.getMonth());
    if (now.getDate() < cut.getDate()) months -= 1;
    return Math.max(0, months);
  }

  function autoSeasoningStatus(dateStr) {
    var m = monthsSince(dateStr);
    if (m < 6) return 'Green';
    if (m < 12) return 'Seasoning';
    return 'Seasoned';
  }

  function downloadBlob(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(val) {
    var s = String(val === undefined || val === null ? '' : val);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function businessNameOrDefault() {
    return escapeHtml((state.meta && state.meta.businessName) || 'Firewood Books');
  }

  // ---------------------------------------------------------------------
  // data load / save / sample data
  // ---------------------------------------------------------------------

  function loadState() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sales)) return parsed;
      } catch (e) {
        console.error('Could not read saved data, starting with sample data instead.', e);
      }
    }
    return createSampleState();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createSampleState() {
    var today = new Date();

    function daysAgo(n) {
      var d = new Date(today);
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    }

    function monthsAgo(n) {
      var d = new Date(today);
      d.setMonth(d.getMonth() - n);
      return d.toISOString().slice(0, 10);
    }

    return {
      meta: { disclaimerShown: false, businessName: '', isSample: true },
      sales: [
        { id: uid(), date: daysAgo(2), customer: 'J. Smith', product: 'Face cord — seasoned oak', qty: 2, unit: 'cords', pricePerUnit: 120, total: 240, paymentMethod: 'Venmo', salesTax: 0 },
        { id: uid(), date: daysAgo(5), customer: '', product: 'Bundle — kiln dried', qty: 10, unit: 'bundles', pricePerUnit: 8, total: 80, paymentMethod: 'Cash', salesTax: 0 },
        { id: uid(), date: daysAgo(9), customer: 'R. Alvarez', product: 'Full cord — mixed hardwood', qty: 1, unit: 'cords', pricePerUnit: 220, total: 220, paymentMethod: 'Check', salesTax: 0 },
        { id: uid(), date: daysAgo(16), customer: '', product: 'Face cord — green oak', qty: 3, unit: 'cords', pricePerUnit: 90, total: 270, paymentMethod: 'Zelle', salesTax: 0 },
        { id: uid(), date: monthsAgo(1), customer: 'T. Nguyen', product: 'Half cord — seasoned', qty: 4, unit: 'cords', pricePerUnit: 65, total: 260, paymentMethod: 'Cash', salesTax: 0 },
        { id: uid(), date: monthsAgo(2), customer: 'K. Brooks', product: 'Delivery fee', qty: 1, unit: 'trip', pricePerUnit: 25, total: 25, paymentMethod: 'Venmo', salesTax: 0 }
      ],
      expenses: [
        { id: uid(), date: daysAgo(3), vendor: 'Home Depot', description: 'Bar oil & 2-cycle mix', amount: 34.99, category: 'Supplies', paymentMethod: 'Cash' },
        { id: uid(), date: daysAgo(10), vendor: 'Stihl Dealer', description: 'Replacement chainsaw chain', amount: 22.50, category: 'Equipment/Tools', paymentMethod: 'Credit/Debit Card' },
        { id: uid(), date: daysAgo(14), vendor: 'Shell', description: 'Truck fuel for delivery route', amount: 58.20, category: 'Vehicle & Fuel', paymentMethod: 'Credit/Debit Card' },
        { id: uid(), date: monthsAgo(1), vendor: 'Ace Hardware', description: 'Log splitter maintenance parts', amount: 41.10, category: 'Repairs & Maintenance', paymentMethod: 'Cash' },
        { id: uid(), date: daysAgo(20), vendor: 'Facebook Ads', description: 'Boosted local firewood listing', amount: 20.00, category: 'Advertising', paymentMethod: 'Credit/Debit Card' },
        { id: uid(), date: monthsAgo(2), vendor: 'County Clerk', description: 'Vendor permit renewal', amount: 50.00, category: 'Permits & Licenses', paymentMethod: 'Check' },
        { id: uid(), date: monthsAgo(3), vendor: 'Farm Bureau Insurance', description: 'Liability insurance premium', amount: 115.00, category: 'Insurance', paymentMethod: 'Check' },
        { id: uid(), date: daysAgo(20), vendor: 'Local Diner', description: 'Client meeting coffee', amount: 12.75, category: 'Other', paymentMethod: 'Cash' }
      ],
      mileage: [
        { id: uid(), date: daysAgo(2), purpose: 'Delivery to J. Smith', miles: 14 },
        { id: uid(), date: daysAgo(5), purpose: 'Delivery — bundle drop-off', miles: 22 },
        { id: uid(), date: daysAgo(9), purpose: 'Delivery to R. Alvarez', miles: 9 },
        { id: uid(), date: monthsAgo(1), purpose: 'Supply run to Home Depot', miles: 18 }
      ],
      inventory: [
        { id: uid(), dateCut: monthsAgo(14), woodType: 'Oak', qtyCut: 6, unit: 'cords', sold: 4, statusOverride: 'auto' },
        { id: uid(), dateCut: monthsAgo(5), woodType: 'Mixed hardwood', qtyCut: 5, unit: 'cords', sold: 1.5, statusOverride: 'auto' },
        { id: uid(), dateCut: daysAgo(20), woodType: 'Ash', qtyCut: 4, unit: 'cords', sold: 0, statusOverride: 'auto' }
      ]
    };
  }

  // ---------------------------------------------------------------------
  // toast (with optional undo)
  // ---------------------------------------------------------------------

  function toast(message, undoFn) {
    var el = document.getElementById('toast');
    el.innerHTML = escapeHtml(message) + (undoFn ? ' <button type="button" class="toast-undo" id="toastUndoBtn">Undo</button>' : '');
    el.classList.remove('hidden');
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    if (undoFn) {
      document.getElementById('toastUndoBtn').addEventListener('click', function () {
        undoFn();
        hideToast();
      });
    }
    toastTimer = setTimeout(hideToast, 7000);
  }

  function hideToast() {
    document.getElementById('toast').classList.remove('show');
  }

  // ---------------------------------------------------------------------
  // navigation
  // ---------------------------------------------------------------------

  function switchView(view) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.getElementById('view-' + view).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'dashboard') renderDashboard();
    if (view === 'reports') renderCurrentReport();
  }

  function switchReport(name) {
    document.querySelectorAll('.report-panel').forEach(function (p) { p.classList.remove('active'); });
    document.getElementById('report-' + name).classList.add('active');
    document.querySelectorAll('.sub-tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.report === name);
    });
    currentReport = name;
    renderCurrentReport();
  }

  function renderCurrentReport() {
    if (currentReport === 'pnl') renderPnl();
    if (currentReport === 'quarterly') renderQuarterly();
    if (currentReport === 'taxtime') renderTaxtime();
  }

  // ---------------------------------------------------------------------
  // shared income/expense computation
  // ---------------------------------------------------------------------

  function computeIncomeExpense(filterFn) {
    var salesInPeriod = state.sales.filter(filterFn);
    var income = salesInPeriod.reduce(function (sum, s) { return sum + s.total; }, 0);
    var salesTaxCollected = salesInPeriod.reduce(function (sum, s) { return sum + (s.salesTax || 0); }, 0);
    var byCategory = {};
    EXPENSE_CATEGORIES.forEach(function (c) { byCategory[c] = 0; });
    state.expenses.filter(filterFn).forEach(function (e) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    var expenseTotal = Object.keys(byCategory).reduce(function (sum, c) { return sum + byCategory[c]; }, 0);
    return {
      income: round2(income),
      byCategory: byCategory,
      expenseTotal: round2(expenseTotal),
      net: round2(income - expenseTotal),
      salesTaxCollected: round2(salesTaxCollected)
    };
  }

  // ---------------------------------------------------------------------
  // dashboard
  // ---------------------------------------------------------------------

  function renderDashboard() {
    var ym = todayStr().slice(0, 7);
    var y = todayStr().slice(0, 4);
    var monthData = computeIncomeExpense(function (r) { return r.date.slice(0, 7) === ym; });
    var yearData = computeIncomeExpense(function (r) { return r.date.slice(0, 4) === y; });

    setTileValue('dashMonthIncome', monthData.income, false);
    setTileValue('dashMonthExpenses', monthData.expenseTotal, false);
    setTileValue('dashMonthNet', monthData.net, true);
    setTileValue('dashYtdIncome', yearData.income, false);
    setTileValue('dashYtdExpenses', yearData.expenseTotal, false);
    setTileValue('dashYtdNet', yearData.net, true);

    var note = document.getElementById('sampleDataNote');
    note.textContent = (state.meta && state.meta.isSample)
      ? "You're viewing sample data so you can see how this works. Visit Backup & Settings to clear it before entering your real numbers."
      : '';
  }

  function setTileValue(id, value, checkNegative) {
    var el = document.getElementById(id);
    el.textContent = money(value);
    if (checkNegative) el.closest('.tile').classList.toggle('tile-negative', value < 0);
  }

  // ---------------------------------------------------------------------
  // SALES
  // ---------------------------------------------------------------------

  function updateSaleTotalPreview() {
    var qty = parseFloat(document.getElementById('saleQty').value) || 0;
    var price = parseFloat(document.getElementById('salePrice').value) || 0;
    document.getElementById('saleTotalDisplay').textContent = money(round2(qty * price));
  }

  function resetSaleForm() {
    document.getElementById('salesForm').reset();
    document.getElementById('saleDate').value = todayStr();
    document.getElementById('saleUnit').value = 'cords';
    document.getElementById('saleTax').value = 0;
    document.getElementById('saleEditId').value = '';
    editingIds.sale = null;
    document.getElementById('saleSubmitBtn').textContent = 'Add Sale';
    document.getElementById('saleCancelEdit').classList.add('hidden');
    updateSaleTotalPreview();
  }

  function startEditSale(id) {
    var s = state.sales.find(function (x) { return x.id === id; });
    if (!s) return;
    editingIds.sale = id;
    document.getElementById('saleEditId').value = id;
    document.getElementById('saleDate').value = s.date;
    document.getElementById('saleCustomer').value = s.customer || '';
    document.getElementById('saleProduct').value = s.product;
    document.getElementById('saleQty').value = s.qty;
    document.getElementById('saleUnit').value = s.unit || 'cords';
    document.getElementById('salePrice').value = s.pricePerUnit;
    document.getElementById('salePayment').value = s.paymentMethod;
    document.getElementById('saleTax').value = s.salesTax || 0;
    updateSaleTotalPreview();
    document.getElementById('saleSubmitBtn').textContent = 'Save Changes';
    document.getElementById('saleCancelEdit').classList.remove('hidden');
    switchView('sales');
    window.scrollTo(0, 0);
  }

  function deleteSale(id) {
    var idx = state.sales.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return;
    var removed = state.sales[idx];
    state.sales.splice(idx, 1);
    saveState();
    renderSalesTable();
    renderDashboard();
    toast('Sale deleted.', function () {
      state.sales.splice(idx, 0, removed);
      saveState();
      renderSalesTable();
      renderDashboard();
    });
  }

  function handleSalesFormSubmit(e) {
    e.preventDefault();
    var qty = parseFloat(document.getElementById('saleQty').value) || 0;
    var price = parseFloat(document.getElementById('salePrice').value) || 0;
    var data = {
      date: document.getElementById('saleDate').value,
      customer: document.getElementById('saleCustomer').value.trim(),
      product: document.getElementById('saleProduct').value.trim(),
      qty: qty,
      unit: document.getElementById('saleUnit').value.trim() || 'cords',
      pricePerUnit: price,
      total: round2(qty * price),
      paymentMethod: document.getElementById('salePayment').value,
      salesTax: parseFloat(document.getElementById('saleTax').value) || 0
    };

    var confirmMsg = 'Sale added: ' + money(data.total) + ' — ' + data.qty + ' ' + data.product +
      (data.customer ? ' to ' + data.customer : '');

    if (editingIds.sale) {
      var idx = state.sales.findIndex(function (x) { return x.id === editingIds.sale; });
      if (idx > -1) {
        data.id = editingIds.sale;
        state.sales[idx] = data;
        saveState();
        renderSalesTable();
        renderDashboard();
        toast('Sale updated: ' + money(data.total) + ' — ' + data.qty + ' ' + data.product);
      }
      resetSaleForm();
      return;
    }

    data.id = uid();
    state.sales.push(data);
    if (state.meta) state.meta.isSample = false;
    saveState();
    renderSalesTable();
    renderDashboard();
    var newId = data.id;
    toast(confirmMsg, function () {
      var i = state.sales.findIndex(function (x) { return x.id === newId; });
      if (i > -1) state.sales.splice(i, 1);
      saveState();
      renderSalesTable();
      renderDashboard();
    });
    resetSaleForm();
  }

  function renderSalesTable() {
    var tbody = document.getElementById('salesTableBody');
    var from = document.getElementById('salesFilterFrom').value;
    var to = document.getElementById('salesFilterTo').value;
    var rows = state.sales.filter(function (s) {
      return (!from || s.date >= from) && (!to || s.date <= to);
    });
    rows.sort(function (a, b) {
      return salesSortDir === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    tbody.innerHTML = rows.map(function (s) {
      return '<tr>' +
        '<td>' + fmtDate(s.date) + '</td>' +
        '<td>' + escapeHtml(s.customer || '—') + '</td>' +
        '<td>' + escapeHtml(s.product) + '</td>' +
        '<td>' + s.qty + ' ' + escapeHtml(s.unit || '') + '</td>' +
        '<td>' + money(s.pricePerUnit) + '</td>' +
        '<td>' + (s.salesTax ? money(s.salesTax) : '—') + '</td>' +
        '<td>' + money(s.total) + '</td>' +
        '<td>' + escapeHtml(s.paymentMethod) + '</td>' +
        '<td class="row-actions">' +
          '<button type="button" class="icon-btn" data-action="edit-sale" data-id="' + s.id + '" title="Edit">✏️</button>' +
          '<button type="button" class="icon-btn" data-action="delete-sale" data-id="' + s.id + '" title="Delete">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="9" class="empty-row">No sales logged yet.</td></tr>';
  }

  // ---------------------------------------------------------------------
  // EXPENSES
  // ---------------------------------------------------------------------

  function resetExpenseForm() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = todayStr();
    document.getElementById('expenseEditId').value = '';
    editingIds.expense = null;
    document.getElementById('expenseSubmitBtn').textContent = 'Add Expense';
    document.getElementById('expenseCancelEdit').classList.add('hidden');
  }

  function startEditExpense(id) {
    var ex = state.expenses.find(function (x) { return x.id === id; });
    if (!ex) return;
    editingIds.expense = id;
    document.getElementById('expenseEditId').value = id;
    document.getElementById('expenseDate').value = ex.date;
    document.getElementById('expenseVendor').value = ex.vendor;
    document.getElementById('expenseDescription').value = ex.description;
    document.getElementById('expenseAmount').value = ex.amount;
    document.getElementById('expenseCategory').value = ex.category;
    document.getElementById('expensePayment').value = ex.paymentMethod;
    document.getElementById('expenseSubmitBtn').textContent = 'Save Changes';
    document.getElementById('expenseCancelEdit').classList.remove('hidden');
    switchView('expenses');
    window.scrollTo(0, 0);
  }

  function deleteExpense(id) {
    var idx = state.expenses.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return;
    var removed = state.expenses[idx];
    state.expenses.splice(idx, 1);
    saveState();
    renderExpensesTable();
    renderDashboard();
    toast('Expense deleted.', function () {
      state.expenses.splice(idx, 0, removed);
      saveState();
      renderExpensesTable();
      renderDashboard();
    });
  }

  function handleExpenseFormSubmit(e) {
    e.preventDefault();
    var data = {
      date: document.getElementById('expenseDate').value,
      vendor: document.getElementById('expenseVendor').value.trim(),
      description: document.getElementById('expenseDescription').value.trim(),
      amount: round2(parseFloat(document.getElementById('expenseAmount').value) || 0),
      category: document.getElementById('expenseCategory').value,
      paymentMethod: document.getElementById('expensePayment').value
    };

    if (editingIds.expense) {
      var idx = state.expenses.findIndex(function (x) { return x.id === editingIds.expense; });
      if (idx > -1) {
        data.id = editingIds.expense;
        state.expenses[idx] = data;
        saveState();
        renderExpensesTable();
        renderDashboard();
        toast('Expense updated: ' + money(data.amount) + ' — ' + data.description);
      }
      resetExpenseForm();
      return;
    }

    data.id = uid();
    state.expenses.push(data);
    if (state.meta) state.meta.isSample = false;
    saveState();
    renderExpensesTable();
    renderDashboard();
    var newId = data.id;
    toast('Expense added: ' + money(data.amount) + ' — ' + data.description + ' (' + data.category + ')', function () {
      var i = state.expenses.findIndex(function (x) { return x.id === newId; });
      if (i > -1) state.expenses.splice(i, 1);
      saveState();
      renderExpensesTable();
      renderDashboard();
    });
    resetExpenseForm();
  }

  function renderExpensesTable() {
    var tbody = document.getElementById('expensesTableBody');
    var from = document.getElementById('expensesFilterFrom').value;
    var to = document.getElementById('expensesFilterTo').value;
    var rows = state.expenses.filter(function (ex) {
      return (!from || ex.date >= from) && (!to || ex.date <= to);
    });
    rows.sort(function (a, b) {
      return expensesSortDir === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    tbody.innerHTML = rows.map(function (ex) {
      return '<tr>' +
        '<td>' + fmtDate(ex.date) + '</td>' +
        '<td>' + escapeHtml(ex.vendor) + '</td>' +
        '<td>' + escapeHtml(ex.description) + '</td>' +
        '<td>' + escapeHtml(ex.category) + '</td>' +
        '<td>' + money(ex.amount) + '</td>' +
        '<td>' + escapeHtml(ex.paymentMethod) + '</td>' +
        '<td class="row-actions">' +
          '<button type="button" class="icon-btn" data-action="edit-expense" data-id="' + ex.id + '" title="Edit">✏️</button>' +
          '<button type="button" class="icon-btn" data-action="delete-expense" data-id="' + ex.id + '" title="Delete">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="7" class="empty-row">No expenses logged yet.</td></tr>';
  }

  // ---------------------------------------------------------------------
  // MILEAGE
  // ---------------------------------------------------------------------

  function resetMileageForm() {
    document.getElementById('mileageForm').reset();
    document.getElementById('mileageDate').value = todayStr();
    document.getElementById('mileageEditId').value = '';
    editingIds.mileage = null;
    document.getElementById('mileageSubmitBtn').textContent = 'Log Trip';
    document.getElementById('mileageCancelEdit').classList.add('hidden');
  }

  function startEditMileage(id) {
    var m = state.mileage.find(function (x) { return x.id === id; });
    if (!m) return;
    editingIds.mileage = id;
    document.getElementById('mileageEditId').value = id;
    document.getElementById('mileageDate').value = m.date;
    document.getElementById('mileageMiles').value = m.miles;
    document.getElementById('mileagePurpose').value = m.purpose;
    document.getElementById('mileageSubmitBtn').textContent = 'Save Changes';
    document.getElementById('mileageCancelEdit').classList.remove('hidden');
    switchView('mileage');
    window.scrollTo(0, 0);
  }

  function deleteMileage(id) {
    var idx = state.mileage.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return;
    var removed = state.mileage[idx];
    state.mileage.splice(idx, 1);
    saveState();
    renderMileageTable();
    toast('Trip deleted.', function () {
      state.mileage.splice(idx, 0, removed);
      saveState();
      renderMileageTable();
    });
  }

  function handleMileageFormSubmit(e) {
    e.preventDefault();
    var data = {
      date: document.getElementById('mileageDate').value,
      purpose: document.getElementById('mileagePurpose').value.trim(),
      miles: round2(parseFloat(document.getElementById('mileageMiles').value) || 0)
    };

    if (editingIds.mileage) {
      var idx = state.mileage.findIndex(function (x) { return x.id === editingIds.mileage; });
      if (idx > -1) {
        data.id = editingIds.mileage;
        state.mileage[idx] = data;
        saveState();
        renderMileageTable();
        toast('Trip updated: ' + data.miles + ' miles — ' + data.purpose);
      }
      resetMileageForm();
      return;
    }

    data.id = uid();
    state.mileage.push(data);
    if (state.meta) state.meta.isSample = false;
    saveState();
    renderMileageTable();
    var newId = data.id;
    toast('Trip logged: ' + data.miles + ' miles — ' + data.purpose, function () {
      var i = state.mileage.findIndex(function (x) { return x.id === newId; });
      if (i > -1) state.mileage.splice(i, 1);
      saveState();
      renderMileageTable();
    });
    resetMileageForm();
  }

  function renderMileageTable() {
    var tbody = document.getElementById('mileageTableBody');
    var from = document.getElementById('mileageFilterFrom').value;
    var to = document.getElementById('mileageFilterTo').value;
    var rows = state.mileage.filter(function (m) {
      return (!from || m.date >= from) && (!to || m.date <= to);
    });
    rows.sort(function (a, b) { return b.date.localeCompare(a.date); });
    tbody.innerHTML = rows.map(function (m) {
      return '<tr>' +
        '<td>' + fmtDate(m.date) + '</td>' +
        '<td>' + escapeHtml(m.purpose) + '</td>' +
        '<td>' + m.miles + '</td>' +
        '<td class="row-actions">' +
          '<button type="button" class="icon-btn" data-action="edit-mileage" data-id="' + m.id + '" title="Edit">✏️</button>' +
          '<button type="button" class="icon-btn" data-action="delete-mileage" data-id="' + m.id + '" title="Delete">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="4" class="empty-row">No trips logged yet.</td></tr>';

    var totalMiles = rows.reduce(function (sum, m) { return sum + m.miles; }, 0);
    document.getElementById('mileageTotalDisplay').textContent =
      rows.length ? ('Total miles shown: ' + round2(totalMiles).toLocaleString()) : '';
  }

  // ---------------------------------------------------------------------
  // INVENTORY
  // ---------------------------------------------------------------------

  function resetInventoryForm() {
    document.getElementById('inventoryForm').reset();
    document.getElementById('invDateCut').value = todayStr();
    document.getElementById('invUnit').value = 'cords';
    document.getElementById('invStatus').value = 'auto';
    document.getElementById('invEditId').value = '';
    editingIds.batch = null;
    document.getElementById('invSubmitBtn').textContent = 'Add Batch';
    document.getElementById('invCancelEdit').classList.add('hidden');
  }

  function startEditBatch(id) {
    var b = state.inventory.find(function (x) { return x.id === id; });
    if (!b) return;
    editingIds.batch = id;
    document.getElementById('invEditId').value = id;
    document.getElementById('invDateCut').value = b.dateCut;
    document.getElementById('invWoodType').value = b.woodType;
    document.getElementById('invQty').value = b.qtyCut;
    document.getElementById('invUnit').value = b.unit;
    document.getElementById('invStatus').value = b.statusOverride || 'auto';
    document.getElementById('invSubmitBtn').textContent = 'Save Changes';
    document.getElementById('invCancelEdit').classList.remove('hidden');
    switchView('inventory');
    window.scrollTo(0, 0);
  }

  function deleteBatch(id) {
    var idx = state.inventory.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return;
    var removed = state.inventory[idx];
    state.inventory.splice(idx, 1);
    saveState();
    renderInventoryTable();
    toast('Wood batch deleted.', function () {
      state.inventory.splice(idx, 0, removed);
      saveState();
      renderInventoryTable();
    });
  }

  function handleInventoryFormSubmit(e) {
    e.preventDefault();
    var data = {
      dateCut: document.getElementById('invDateCut').value,
      woodType: document.getElementById('invWoodType').value.trim(),
      qtyCut: round2(parseFloat(document.getElementById('invQty').value) || 0),
      unit: document.getElementById('invUnit').value.trim() || 'cords',
      statusOverride: document.getElementById('invStatus').value
    };

    if (editingIds.batch) {
      var idx = state.inventory.findIndex(function (x) { return x.id === editingIds.batch; });
      if (idx > -1) {
        data.id = editingIds.batch;
        data.sold = state.inventory[idx].sold;
        state.inventory[idx] = data;
        saveState();
        renderInventoryTable();
        toast('Batch updated: ' + data.woodType);
      }
      resetInventoryForm();
      return;
    }

    data.id = uid();
    data.sold = 0;
    state.inventory.push(data);
    saveState();
    renderInventoryTable();
    var newId = data.id;
    toast('Batch added: ' + data.qtyCut + ' ' + data.unit + ' of ' + data.woodType, function () {
      var i = state.inventory.findIndex(function (x) { return x.id === newId; });
      if (i > -1) state.inventory.splice(i, 1);
      saveState();
      renderInventoryTable();
    });
    resetInventoryForm();
  }

  function logSoldFromBatch(id) {
    var b = state.inventory.find(function (x) { return x.id === id; });
    if (!b) return;
    var input = document.getElementById('soldInput-' + id);
    var qty = parseFloat(input.value) || 0;
    if (qty <= 0) {
      toast('Enter a quantity greater than zero.');
      return;
    }
    var remaining = round2(b.qtyCut - b.sold);
    if (qty > remaining) {
      toast('Only ' + remaining + ' ' + b.unit + ' remaining in this batch — check the amount and try again.');
      return;
    }
    var status = (b.statusOverride && b.statusOverride !== 'auto') ? b.statusOverride : autoSeasoningStatus(b.dateCut);
    b.sold = round2(b.sold + qty);
    saveState();
    renderInventoryTable();
    var msg = 'Logged ' + qty + ' ' + b.unit + ' sold from ' + b.woodType + ' batch.';
    if (status === 'Green') msg += ' Note: this batch is still marked Green — double check it\'s actually ready to sell.';
    toast(msg);
  }

  function renderInventoryTable() {
    var tbody = document.getElementById('inventoryTableBody');
    var rows = state.inventory.slice().sort(function (a, b) { return b.dateCut.localeCompare(a.dateCut); });
    tbody.innerHTML = rows.map(function (b) {
      var status = (b.statusOverride && b.statusOverride !== 'auto') ? b.statusOverride : autoSeasoningStatus(b.dateCut);
      var remaining = round2(b.qtyCut - b.sold);
      var statusClass = status === 'Green' ? 'status-green' : (status === 'Seasoning' ? 'status-seasoning' : 'status-seasoned');
      return '<tr>' +
        '<td>' + fmtDate(b.dateCut) + '</td>' +
        '<td>' + escapeHtml(b.woodType) + '</td>' +
        '<td>' + b.qtyCut + ' ' + escapeHtml(b.unit) + '</td>' +
        '<td>' + b.sold + ' ' + escapeHtml(b.unit) + '</td>' +
        '<td class="' + (remaining <= 0 ? 'remaining-zero' : '') + '">' + remaining + ' ' + escapeHtml(b.unit) + '</td>' +
        '<td><span class="status-pill ' + statusClass + '">' + status + '</span></td>' +
        '<td class="log-sold-cell">' +
          '<input type="number" min="0" step="0.5" class="mini-input" id="soldInput-' + b.id + '" placeholder="qty">' +
          '<button type="button" class="btn btn-tiny" data-action="log-sold" data-id="' + b.id + '">Log Sold</button>' +
        '</td>' +
        '<td class="row-actions">' +
          '<button type="button" class="icon-btn" data-action="edit-batch" data-id="' + b.id + '" title="Edit">✏️</button>' +
          '<button type="button" class="icon-btn" data-action="delete-batch" data-id="' + b.id + '" title="Delete">🗑️</button>' +
        '</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="8" class="empty-row">No wood batches logged yet.</td></tr>';
  }

  // ---------------------------------------------------------------------
  // REPORTS: Profit & Loss
  // ---------------------------------------------------------------------

  function monthLabel(val) {
    var parts = val.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function renderPnl() {
    var period = document.querySelector('input[name="pnlPeriod"]:checked').value;
    var filterFn, title;
    if (period === 'month') {
      var val = document.getElementById('pnlMonthInput').value;
      if (!val) return;
      filterFn = function (r) { return r.date.slice(0, 7) === val; };
      title = monthLabel(val);
    } else {
      var year = document.getElementById('pnlYearInput').value;
      filterFn = function (r) { return r.date.slice(0, 4) === String(year); };
      title = 'Year ' + year;
    }
    var data = computeIncomeExpense(filterFn);
    var rows = EXPENSE_CATEGORIES.map(function (c) {
      return '<tr><td>' + c + '</td><td>' + money(data.byCategory[c]) + '</td></tr>';
    }).join('');
    document.getElementById('pnlContent').innerHTML =
      '<h2>' + businessNameOrDefault() + ' — Profit &amp; Loss</h2>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<table class="report-table">' +
        '<tr class="report-income-row"><td>Money In (Sales Income)</td><td>' + money(data.income) + '</td></tr>' +
        '<tr><th colspan="2">Money Out (Expenses)</th></tr>' +
        rows +
        '<tr class="report-total-row"><td>Total Expenses</td><td>' + money(data.expenseTotal) + '</td></tr>' +
        '<tr class="report-net-row"><td>Net Profit</td><td>' + money(data.net) + '</td></tr>' +
      '</table>' +
      (data.salesTaxCollected ? '<p class="helper-text">Sales tax collected in this period (tracked separately, not counted as income): ' + money(data.salesTaxCollected) + '</p>' : '');
  }

  // ---------------------------------------------------------------------
  // REPORTS: Quarterly summary
  // ---------------------------------------------------------------------

  function renderQuarterly() {
    var year = document.getElementById('quarterlyYearInput').value;
    var quarters = [
      { label: 'Q1 (Jan–Mar)', months: ['01', '02', '03'] },
      { label: 'Q2 (Apr–Jun)', months: ['04', '05', '06'] },
      { label: 'Q3 (Jul–Sep)', months: ['07', '08', '09'] },
      { label: 'Q4 (Oct–Dec)', months: ['10', '11', '12'] }
    ];
    var rows = quarters.map(function (q) {
      var filterFn = function (r) { return r.date.slice(0, 4) === String(year) && q.months.indexOf(r.date.slice(5, 7)) > -1; };
      var d = computeIncomeExpense(filterFn);
      return '<tr><td>' + q.label + '</td><td>' + money(d.income) + '</td><td>' + money(d.expenseTotal) + '</td><td>' + money(d.net) + '</td></tr>';
    }).join('');
    document.getElementById('quarterlyContent').innerHTML =
      '<h2>' + businessNameOrDefault() + ' — Quarterly Summary</h2>' +
      '<h3>Year ' + escapeHtml(String(year)) + '</h3>' +
      '<table class="report-table">' +
        '<tr><th>Quarter</th><th>Money In</th><th>Money Out</th><th>Net Profit</th></tr>' +
        rows +
      '</table>' +
      '<p class="helper-text">Reminder: sole proprietors who expect to owe more than about $1,000 in tax for the year may need to make estimated quarterly payments. This is a general reminder, not tax advice — check with a tax professional or the IRS for your specific situation.</p>';
  }

  // ---------------------------------------------------------------------
  // REPORTS: Tax time export
  // ---------------------------------------------------------------------

  function computeYearData(year) {
    var filterFn = function (r) { return r.date.slice(0, 4) === String(year); };
    var data = computeIncomeExpense(filterFn);
    var miles = state.mileage.filter(filterFn).reduce(function (s, m) { return s + m.miles; }, 0);
    data.miles = round2(miles);
    data.year = year;
    return data;
  }

  function renderTaxtime() {
    var year = document.getElementById('taxYearInput').value;
    var d = computeYearData(year);
    document.getElementById('taxtimeContent').innerHTML =
      '<h2>' + businessNameOrDefault() + ' — Tax Time Summary</h2>' +
      '<h3>Year ' + escapeHtml(String(year)) + '</h3>' +
      '<p class="helper-text">Organized by Schedule C category. This is a record-organizing tool, not tax advice — share this with your tax preparer.</p>' +
      '<table class="report-table">' +
        '<tr class="report-income-row"><td>Gross Receipts (Sales Income)</td><td>' + money(d.income) + '</td></tr>' +
        '<tr><th colspan="2">Expenses by Schedule C Category</th></tr>' +
        EXPENSE_CATEGORIES.map(function (c) { return '<tr><td>' + c + '</td><td>' + money(d.byCategory[c]) + '</td></tr>'; }).join('') +
        '<tr class="report-total-row"><td>Total Expenses</td><td>' + money(d.expenseTotal) + '</td></tr>' +
        '<tr class="report-net-row"><td>Net Profit</td><td>' + money(d.net) + '</td></tr>' +
      '</table>' +
      '<table class="report-table">' +
        '<tr><td>Business Miles Logged</td><td>' + d.miles.toLocaleString() + ' miles</td></tr>' +
        (d.salesTaxCollected ? '<tr><td>Sales Tax Collected (pass-through, not income)</td><td>' + money(d.salesTaxCollected) + '</td></tr>' : '') +
      '</table>';
  }

  function downloadTaxCsv() {
    var year = document.getElementById('taxYearInput').value;
    var d = computeYearData(year);
    var lines = [];
    lines.push(['Firewood Books — Tax Time Summary']);
    lines.push(['Year', year]);
    lines.push([]);
    lines.push(['Category', 'Amount']);
    lines.push(['Gross Receipts (Sales Income)', d.income.toFixed(2)]);
    EXPENSE_CATEGORIES.forEach(function (c) { lines.push([c, d.byCategory[c].toFixed(2)]); });
    lines.push(['Total Expenses', d.expenseTotal.toFixed(2)]);
    lines.push(['Net Profit', d.net.toFixed(2)]);
    lines.push([]);
    lines.push(['Business Miles Logged', d.miles]);
    if (d.salesTaxCollected) lines.push(['Sales Tax Collected (pass-through, not income)', d.salesTaxCollected.toFixed(2)]);
    lines.push([]);

    lines.push(['--- Sales Detail ---']);
    lines.push(['Date', 'Customer', 'Product', 'Qty', 'Unit', 'Price/Unit', 'Sales Tax', 'Total', 'Payment Method']);
    state.sales.filter(function (s) { return s.date.slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .forEach(function (s) {
        lines.push([s.date, s.customer, s.product, s.qty, s.unit, s.pricePerUnit.toFixed(2), (s.salesTax || 0).toFixed(2), s.total.toFixed(2), s.paymentMethod]);
      });
    lines.push([]);

    lines.push(['--- Expense Detail ---']);
    lines.push(['Date', 'Vendor', 'Description', 'Category', 'Amount', 'Payment Method']);
    state.expenses.filter(function (e) { return e.date.slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .forEach(function (e) {
        lines.push([e.date, e.vendor, e.description, e.category, e.amount.toFixed(2), e.paymentMethod]);
      });
    lines.push([]);

    lines.push(['--- Mileage Detail ---']);
    lines.push(['Date', 'Purpose', 'Miles']);
    state.mileage.filter(function (m) { return m.date.slice(0, 4) === String(year); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); })
      .forEach(function (m) { lines.push([m.date, m.purpose, m.miles]); });

    var csv = lines.map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n');
    downloadBlob(csv, 'firewood-books-tax-summary-' + year + '.csv', 'text/csv');
    toast('Tax summary CSV downloaded for ' + year + '.');
  }

  // ---------------------------------------------------------------------
  // BACKUP / IMPORT / CLEAR
  // ---------------------------------------------------------------------

  function exportBackup() {
    var json = JSON.stringify(state, null, 2);
    downloadBlob(json, 'firewood-books-backup-' + todayStr() + '.json', 'application/json');
    toast('Backup file downloaded. Store it somewhere safe!');
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.sales) || !Array.isArray(parsed.expenses) ||
            !Array.isArray(parsed.mileage) || !Array.isArray(parsed.inventory)) {
          throw new Error('bad shape');
        }
        if (!confirm('Importing will replace all current data in this app with the contents of the backup file. Continue?')) return;
        state = parsed;
        state.meta = state.meta || {};
        state.meta.disclaimerShown = true;
        state.meta.isSample = false;
        saveState();
        renderAll();
        toast('Backup imported successfully.');
      } catch (err) {
        alert('This file could not be read as a Firewood Books backup. Nothing was changed.');
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm('This will permanently erase all sales, expenses, mileage, and inventory records in this app (sample or real). This cannot be undone unless you have a backup. Continue?')) return;
    var keepName = (state.meta && state.meta.businessName) || '';
    state = { meta: { disclaimerShown: true, businessName: keepName, isSample: false }, sales: [], expenses: [], mileage: [], inventory: [] };
    saveState();
    renderAll();
    toast('All data cleared. Ready for your real records.');
  }

  // ---------------------------------------------------------------------
  // wiring / init
  // ---------------------------------------------------------------------

  function populateSelects() {
    var salePayment = document.getElementById('salePayment');
    var expensePayment = document.getElementById('expensePayment');
    PAYMENT_METHODS.forEach(function (m) {
      salePayment.appendChild(new Option(m, m));
      expensePayment.appendChild(new Option(m, m));
    });

    var expenseCategory = document.getElementById('expenseCategory');
    EXPENSE_CATEGORIES.forEach(function (c) { expenseCategory.appendChild(new Option(c, c)); });

    var datalist = document.getElementById('productSuggestions');
    PRODUCT_SUGGESTIONS.forEach(function (p) { datalist.appendChild(new Option(p, p)); });

    document.getElementById('businessNameInput').value = (state.meta && state.meta.businessName) || '';
  }

  function setDefaultDates() {
    var t = todayStr();
    document.getElementById('saleDate').value = t;
    document.getElementById('expenseDate').value = t;
    document.getElementById('mileageDate').value = t;
    document.getElementById('invDateCut').value = t;
    document.getElementById('pnlMonthInput').value = t.slice(0, 7);
    document.getElementById('pnlYearInput').value = t.slice(0, 4);
    document.getElementById('quarterlyYearInput').value = t.slice(0, 4);
    document.getElementById('taxYearInput').value = t.slice(0, 4);
  }

  function wireEvents() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchView(btn.dataset.view); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () { switchView(btn.dataset.goto); });
    });

    document.getElementById('disclaimerOkBtn').addEventListener('click', function () {
      state.meta.disclaimerShown = true;
      saveState();
      document.getElementById('disclaimerOverlay').classList.add('hidden');
    });

    // Sales
    document.getElementById('salesForm').addEventListener('submit', handleSalesFormSubmit);
    document.getElementById('saleQty').addEventListener('input', updateSaleTotalPreview);
    document.getElementById('salePrice').addEventListener('input', updateSaleTotalPreview);
    document.getElementById('saleCancelEdit').addEventListener('click', resetSaleForm);
    document.getElementById('salesFilterFrom').addEventListener('change', renderSalesTable);
    document.getElementById('salesFilterTo').addEventListener('change', renderSalesTable);
    document.getElementById('salesFilterClear').addEventListener('click', function () {
      document.getElementById('salesFilterFrom').value = '';
      document.getElementById('salesFilterTo').value = '';
      renderSalesTable();
    });
    document.getElementById('salesSortToggle').addEventListener('click', function (e) {
      salesSortDir = salesSortDir === 'desc' ? 'asc' : 'desc';
      e.target.textContent = salesSortDir === 'desc' ? 'Newest first ↓' : 'Oldest first ↑';
      renderSalesTable();
    });
    document.getElementById('salesTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit-sale') startEditSale(btn.dataset.id);
      if (btn.dataset.action === 'delete-sale') deleteSale(btn.dataset.id);
    });

    // Expenses
    document.getElementById('expenseForm').addEventListener('submit', handleExpenseFormSubmit);
    document.getElementById('expenseCancelEdit').addEventListener('click', resetExpenseForm);
    document.getElementById('expensesFilterFrom').addEventListener('change', renderExpensesTable);
    document.getElementById('expensesFilterTo').addEventListener('change', renderExpensesTable);
    document.getElementById('expensesFilterClear').addEventListener('click', function () {
      document.getElementById('expensesFilterFrom').value = '';
      document.getElementById('expensesFilterTo').value = '';
      renderExpensesTable();
    });
    document.getElementById('expensesSortToggle').addEventListener('click', function (e) {
      expensesSortDir = expensesSortDir === 'desc' ? 'asc' : 'desc';
      e.target.textContent = expensesSortDir === 'desc' ? 'Newest first ↓' : 'Oldest first ↑';
      renderExpensesTable();
    });
    document.getElementById('expensesTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit-expense') startEditExpense(btn.dataset.id);
      if (btn.dataset.action === 'delete-expense') deleteExpense(btn.dataset.id);
    });

    // Mileage
    document.getElementById('mileageForm').addEventListener('submit', handleMileageFormSubmit);
    document.getElementById('mileageCancelEdit').addEventListener('click', resetMileageForm);
    document.getElementById('mileageFilterFrom').addEventListener('change', renderMileageTable);
    document.getElementById('mileageFilterTo').addEventListener('change', renderMileageTable);
    document.getElementById('mileageFilterClear').addEventListener('click', function () {
      document.getElementById('mileageFilterFrom').value = '';
      document.getElementById('mileageFilterTo').value = '';
      renderMileageTable();
    });
    document.getElementById('mileageTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit-mileage') startEditMileage(btn.dataset.id);
      if (btn.dataset.action === 'delete-mileage') deleteMileage(btn.dataset.id);
    });

    // Inventory
    document.getElementById('inventoryForm').addEventListener('submit', handleInventoryFormSubmit);
    document.getElementById('invCancelEdit').addEventListener('click', resetInventoryForm);
    document.getElementById('inventoryTableBody').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit-batch') startEditBatch(btn.dataset.id);
      if (btn.dataset.action === 'delete-batch') deleteBatch(btn.dataset.id);
      if (btn.dataset.action === 'log-sold') logSoldFromBatch(btn.dataset.id);
    });

    // Reports
    document.querySelectorAll('.sub-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchReport(btn.dataset.report); });
    });
    document.querySelectorAll('input[name="pnlPeriod"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var period = document.querySelector('input[name="pnlPeriod"]:checked').value;
        document.getElementById('pnlMonthInput').classList.toggle('hidden', period !== 'month');
        document.getElementById('pnlYearInput').classList.toggle('hidden', period !== 'year');
        renderPnl();
      });
    });
    document.getElementById('pnlMonthInput').addEventListener('change', renderPnl);
    document.getElementById('pnlYearInput').addEventListener('change', renderPnl);
    document.getElementById('quarterlyYearInput').addEventListener('change', renderQuarterly);
    document.getElementById('taxYearInput').addEventListener('change', renderTaxtime);
    document.getElementById('pnlPrintBtn').addEventListener('click', function () { window.print(); });
    document.getElementById('quarterlyPrintBtn').addEventListener('click', function () { window.print(); });
    document.getElementById('taxPrintBtn').addEventListener('click', function () { window.print(); });
    document.getElementById('taxCsvBtn').addEventListener('click', downloadTaxCsv);

    // Backup / settings
    document.getElementById('businessNameInput').addEventListener('change', function (e) {
      state.meta.businessName = e.target.value.trim();
      saveState();
    });
    document.getElementById('exportBtn').addEventListener('click', exportBackup);
    document.getElementById('importFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = '';
    });
    document.getElementById('clearSampleBtn').addEventListener('click', clearAllData);
  }

  function maybeShowDisclaimer() {
    if (!state.meta.disclaimerShown) {
      document.getElementById('disclaimerOverlay').classList.remove('hidden');
    }
  }

  function renderAll() {
    renderDashboard();
    renderSalesTable();
    renderExpensesTable();
    renderMileageTable();
    renderInventoryTable();
  }

  function init() {
    state = loadState();
    populateSelects();
    setDefaultDates();
    wireEvents();
    updateSaleTotalPreview();
    maybeShowDisclaimer();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
