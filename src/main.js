// main.js - MediStock Pro
import { auth, db } from './firebase-config';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs,
  limit
} from 'firebase/firestore';

// --- Global State ---
let currentUser = null;
let inventory = [];
let salesHistory = [];
let currentBill = [];
let currentEditId = null;

// --- UI Elements ---
const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const loadingOverlay = document.getElementById('loading-overlay');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const sidebar = document.getElementById('sidebar');

// --- Auth Handling ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    document.getElementById('user-display-name').innerText = user.displayName || 'User';
    document.getElementById('user-display-email').innerText = user.email;
    document.getElementById('user-avatar').innerText = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    
    // Initialize Data Listeners
    initDataListeners();
  } else {
    currentUser = null;
    authScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
    stopDataListeners();
  }
  hideLoading();
});

window.handleLogin = async () => {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  
  if (!email || !pass) return showError(errorDiv, "Please fill all fields");
  
  showLoading();
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    console.error("Login error:", err);
    showError(errorDiv, err.message);
  } finally {
    hideLoading();
  }
};

window.handleRegister = async () => {
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const pass = document.getElementById('reg-password').value;
  const errorDiv = document.getElementById('register-error');
  
  if (!name || !email || !pass) return showError(errorDiv, "Please fill all fields");
  if (pass.length < 6) return showError(errorDiv, "Password must be at least 6 chars");
  
  showLoading();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    showToast("Account created successfully!", "success");
  } catch (err) {
    console.error("Registration error:", err);
    showError(errorDiv, err.message);
  } finally {
    hideLoading();
  }
};

window.handleLogout = () => {
  if (confirm("Are you sure you want to sign out?")) {
    signOut(auth);
  }
};

window.toggleAuth = (mode) => {
  if (mode === 'register') {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  } else {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  }
};

// --- Navigation ---
window.showSection = (sectionId) => {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  
  document.getElementById(`section-${sectionId}`).classList.add('active');
  document.getElementById(`nav-${sectionId}`).classList.add('active');
  document.getElementById('page-title').innerText = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
  
  if (window.innerWidth < 1024) toggleSidebar(true);
};

window.toggleSidebar = (forceClose = false) => {
  if (forceClose) {
    sidebar.classList.add('collapsed');
  } else {
    sidebar.classList.toggle('collapsed');
  }
};

// --- Inventory Management ---
let inventoryUnsub = null;
let salesUnsub = null;

function initDataListeners() {
  const invRef = collection(db, 'users', currentUser.uid, 'inventory');
  inventoryUnsub = onSnapshot(query(invRef, orderBy('name')), (snapshot) => {
    inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateInventoryUI();
    updateDashboardUI();
    updateBillingSelect();
  }, (err) => {
    console.error("Inventory listener error:", err);
    showToast("Inventory sync error: " + err.message, "error");
  });

  const salesRef = collection(db, 'users', currentUser.uid, 'sales');
  salesUnsub = onSnapshot(query(salesRef, orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
    salesHistory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateSalesUI();
    updateDashboardUI();
  }, (err) => {
    console.error("Sales listener error:", err);
    showToast("Sales sync error: " + err.message, "error");
  });
}

function stopDataListeners() {
  if (inventoryUnsub) inventoryUnsub();
  if (salesUnsub) salesUnsub();
}

window.addMedicine = async () => {
  const name = document.getElementById('med-name').value;
  const category = document.getElementById('med-category').value;
  const qty = parseInt(document.getElementById('med-qty').value);
  const price = parseFloat(document.getElementById('med-price').value);
  const batch = document.getElementById('med-batch').value;
  const supplier = document.getElementById('med-supplier').value;
  const expiry = document.getElementById('med-expiry').value;
  const threshold = parseInt(document.getElementById('med-threshold').value) || 10;

  if (!name || isNaN(qty) || isNaN(price)) {
    return showToast("Please fill medicine name, qty and price", "error");
  }

  showLoading();
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'inventory'), {
      name, category, qty, price, batch, supplier, expiry, threshold,
      createdAt: serverTimestamp()
    });
    showToast("Medicine added to stock", "success");
    clearInventoryForm();
  } catch (err) {
    console.error("Add medicine error:", err);
    showToast("Error adding medicine: " + err.message, "error");
  } finally {
    hideLoading();
  }
};

window.deleteMed = async (id) => {
  if (confirm("Delete this medicine from inventory?")) {
    showLoading();
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'inventory', id));
      showToast("Medicine deleted", "info");
    } catch (err) {
      console.error("Delete medicine error:", err);
      showToast("Error deleting: " + err.message, "error");
    } finally {
      hideLoading();
    }
  }
};

window.editMed = (id) => {
  const med = inventory.find(m => m.id === id);
  if (!med) return;
  
  currentEditId = id;
  document.getElementById('edit-name').value = med.name;
  document.getElementById('edit-category').value = med.category || '';
  document.getElementById('edit-qty').value = med.qty;
  document.getElementById('edit-price').value = med.price;
  document.getElementById('edit-batch').value = med.batch || '';
  document.getElementById('edit-supplier').value = med.supplier || '';
  document.getElementById('edit-expiry').value = med.expiry || '';
  document.getElementById('edit-threshold').value = med.threshold || 10;
  
  document.getElementById('edit-modal').classList.remove('hidden');
};

window.closeEditModal = () => {
  document.getElementById('edit-modal').classList.add('hidden');
  currentEditId = null;
};

window.saveEdit = async () => {
  if (!currentEditId) return;
  
  const updates = {
    name: document.getElementById('edit-name').value,
    category: document.getElementById('edit-category').value,
    qty: parseInt(document.getElementById('edit-qty').value),
    price: parseFloat(document.getElementById('edit-price').value),
    batch: document.getElementById('edit-batch').value,
    supplier: document.getElementById('edit-supplier').value,
    expiry: document.getElementById('edit-expiry').value,
    threshold: parseInt(document.getElementById('edit-threshold').value)
  };

  showLoading();
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'inventory', currentEditId), updates);
    showToast("Medicine updated", "success");
    closeEditModal();
  } catch (err) {
    console.error("Update medicine error:", err);
    showToast("Error updating: " + err.message, "error");
  } finally {
    hideLoading();
  }
};

window.clearInventoryForm = () => {
  ['med-name', 'med-category', 'med-qty', 'med-price', 'med-batch', 'med-supplier', 'med-expiry'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('med-threshold').value = 10;
};

// --- Billing System ---
window.addToBill = () => {
  const medId = document.getElementById('bill-med-select').value;
  const qtyInput = document.getElementById('bill-qty');
  const qty = parseInt(qtyInput.value);
  
  if (!medId) return showToast("Select a medicine first", "error");
  if (isNaN(qty) || qty <= 0) return showToast("Enter a valid quantity", "error");
  
  const med = inventory.find(m => m.id === medId);
  if (!med) return;
  
  if (qty > med.qty) return showToast("Insufficient stock!", "error");
  
  const existing = currentBill.find(item => item.id === medId);
  if (existing) {
    if (existing.qty + qty > med.qty) return showToast("Insufficient total stock!", "error");
    existing.qty += qty;
    existing.subtotal = existing.qty * existing.price;
  } else {
    currentBill.push({
      id: medId,
      name: med.name,
      price: med.price,
      qty: qty,
      subtotal: qty * med.price
    });
  }
  
  qtyInput.value = '';
  updateBillUI();
};

window.removeFromBill = (id) => {
  currentBill = currentBill.filter(item => item.id !== id);
  updateBillUI();
};

window.clearBill = () => {
  if (currentBill.length > 0 && confirm("Clear current bill?")) {
    currentBill = [];
    updateBillUI();
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-prescription').value = '';
  }
};

window.checkout = async () => {
  if (currentBill.length === 0) return showToast("Bill is empty", "error");
  
  showLoading();
  try {
    const total = currentBill.reduce((sum, item) => sum + item.subtotal, 0);
    const saleData = {
      customerName: document.getElementById('customer-name').value || 'Walk-in',
      prescription: document.getElementById('customer-prescription').value || 'N/A',
      items: currentBill,
      total: total,
      timestamp: serverTimestamp()
    };

    // 1. Save Sale
    await addDoc(collection(db, 'users', currentUser.uid, 'sales'), saleData);
    
    // 2. Update Stock
    for (const item of currentBill) {
      const med = inventory.find(m => m.id === item.id);
      if (med) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'inventory', item.id), {
          qty: med.qty - item.qty
        });
      }
    }
    
    showToast("Sale completed successfully!", "success");
    currentBill = [];
    updateBillUI();
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-prescription').value = '';
    
  } catch (err) {
    console.error("Checkout error:", err);
    showToast("Checkout failed: " + err.message, "error");
  } finally {
    hideLoading();
  }
};

// --- UI Updates ---
function updateInventoryUI() {
  const tbody = document.getElementById('inventory-tbody');
  const search = document.getElementById('search-input').value.toLowerCase();
  const filterCat = document.getElementById('filter-category').value;
  
  const filtered = inventory.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search) || (m.batch && m.batch.toLowerCase().includes(search));
    const matchCat = !filterCat || m.category === filterCat;
    return matchSearch && matchCat;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No matching medicines found</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(m => {
    const status = getStockStatus(m);
    const expiryStatus = getExpiryStatus(m.expiry);
    
    return `
      <tr>
        <td style="font-weight:600;">${m.name}</td>
        <td><span class="badge badge-blue">${m.category || 'N/A'}</span></td>
        <td><span class="badge ${status.class}">${m.qty}</span></td>
        <td>₹${m.price.toFixed(2)}</td>
        <td><small>${m.batch || '-'}</small></td>
        <td><small>${m.supplier || '-'}</small></td>
        <td><span class="${expiryStatus.class}">${m.expiry || '-'}</span></td>
        <td><span class="badge ${status.class}">${status.label}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-icon primary" onclick="editMed('${m.id}')" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" onclick="deleteMed('${m.id}')" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateBillingSelect() {
  const select = document.getElementById('bill-med-select');
  const currentVal = select.value;
  
  select.innerHTML = '<option value="">Choose a medicine...</option>' + 
    inventory
      .filter(m => m.qty > 0)
      .map(m => `<option value="${m.id}">${m.name} (Stock: ${m.qty})</option>`)
      .join('');
      
  select.value = currentVal;
  
  select.onchange = () => {
    const med = inventory.find(m => m.id === select.value);
    const info = document.getElementById('bill-med-info');
    if (med) {
      info.innerText = `Price: ₹${med.price.toFixed(2)} | Current Stock: ${med.qty} | Batch: ${med.batch || 'N/A'}`;
    } else {
      info.innerText = '';
    }
  };
}

function updateBillUI() {
  const tbody = document.getElementById('bill-tbody');
  const subtotalEl = document.getElementById('bill-subtotal');
  const totalEl = document.getElementById('bill-total');
  
  if (currentBill.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No items added</td></tr>`;
    subtotalEl.innerText = '0.00';
    totalEl.innerText = '0.00';
    return;
  }

  let total = 0;
  tbody.innerHTML = currentBill.map(item => {
    total += item.subtotal;
    return `
      <tr>
        <td style="font-weight:500;">${item.name}</td>
        <td>${item.qty}</td>
        <td>₹${item.price.toFixed(2)}</td>
        <td>₹${item.subtotal.toFixed(2)}</td>
        <td style="text-align:right;">
          <button class="btn-icon danger" onclick="removeFromBill('${item.id}')">✕</button>
        </td>
      </tr>
    `;
  }).join('');

  subtotalEl.innerText = total.toFixed(2);
  totalEl.innerText = total.toFixed(2);
  
  // Generate Invoice ID if starting fresh
  if (!document.getElementById('invoice-id').innerText.includes('-2')) {
    const id = Math.floor(1000 + Math.random() * 9000);
    document.getElementById('invoice-id').innerText = `#INV-${new Date().getFullYear()}-${id}`;
  }
  document.getElementById('invoice-date').innerText = new Date().toLocaleDateString();
}

function updateDashboardUI() {
  const lowStockCount = inventory.filter(m => m.qty <= (m.threshold || 10)).length;
  const expiringCount = inventory.filter(m => {
    if (!m.expiry) return false;
    const exp = new Date(m.expiry);
    const today = new Date();
    const diff = (exp - today) / (1000 * 60 * 60 * 24);
    return diff <= 30; // 30 days
  }).length;

  const todayStr = new Date().toDateString();
  const todaysSales = salesHistory.filter(s => {
    const d = s.timestamp ? s.timestamp.toDate().toDateString() : null;
    return d === todayStr;
  });
  const dailyRev = todaysSales.reduce((sum, s) => sum + s.total, 0);

  document.getElementById('stat-total').innerText = inventory.length;
  document.getElementById('stat-low').innerText = lowStockCount;
  document.getElementById('stat-expiry').innerText = expiringCount;
  document.getElementById('stat-sales').innerText = dailyRev.toLocaleString();
  
  document.getElementById('low-stock-count').innerText = `${lowStockCount} items`;
  document.getElementById('expiry-alert-count').innerText = `${expiringCount} items`;

  // Low Stock List
  const lowList = document.getElementById('low-stock-list');
  const lowItems = inventory.filter(m => m.qty <= (m.threshold || 10)).slice(0, 5);
  if (lowItems.length > 0) {
    lowList.innerHTML = lowItems.map(m => `
      <div class="alert-item">
        <div class="alert-item-info">
          <span class="alert-item-name">${m.name}</span>
          <span class="alert-item-sub">Current: ${m.qty} | Threshold: ${m.threshold || 10}</span>
        </div>
        <span class="badge badge-orange">Low Stock</span>
      </div>
    `).join('');
  } else {
    lowList.innerHTML = `<div class="empty-state-small">All stock levels healthy ✓</div>`;
  }

  // Expiry List
  const expList = document.getElementById('expiry-alert-list');
  const expItems = inventory.filter(m => {
    if (!m.expiry) return false;
    const exp = new Date(m.expiry);
    const today = new Date();
    return (exp - today) / (1000 * 60 * 60 * 24) <= 30;
  }).slice(0, 5);

  if (expItems.length > 0) {
    expList.innerHTML = expItems.map(m => `
      <div class="alert-item">
        <div class="alert-item-info">
          <span class="alert-item-name">${m.name}</span>
          <span class="alert-item-sub">Expires: ${m.expiry}</span>
        </div>
        <span class="badge badge-red">Expiring</span>
      </div>
    `).join('');
    document.getElementById('expiry-badge').style.display = 'flex';
    document.getElementById('expiry-count').innerText = expiringCount;
  } else {
    expList.innerHTML = `<div class="empty-state-small">No medicines expiring soon ✓</div>`;
    document.getElementById('expiry-badge').style.display = 'none';
  }

  // Recent Sales
  const recentList = document.getElementById('recent-sales-list');
  if (todaysSales.length > 0) {
    recentList.innerHTML = todaysSales.slice(0, 5).map(s => `
      <div class="alert-item">
        <div class="alert-item-info">
          <span class="alert-item-name">₹${s.total.toFixed(2)} - ${s.customerName}</span>
          <span class="alert-item-sub">${s.items.length} items • ${s.timestamp ? s.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</span>
        </div>
        <span class="badge badge-green">Paid</span>
      </div>
    `).join('');
  } else {
    recentList.innerHTML = `<div class="empty-state-small">No sales recorded today</div>`;
  }
}

function updateSalesUI() {
  const tbody = document.getElementById('sales-history-tbody');
  
  if (salesHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No sales yet</td></tr>`;
    document.getElementById('report-tx-count').innerText = '0';
    document.getElementById('report-total-revenue').innerText = '0';
    document.getElementById('report-items-sold').innerText = '0';
    return;
  }

  tbody.innerHTML = salesHistory.map(s => `
    <tr>
      <td style="font-weight:600; color:var(--primary);">#${s.id.slice(0, 8).toUpperCase()}</td>
      <td>${s.customerName}</td>
      <td>${s.items.length} items</td>
      <td style="font-weight:600;">₹${s.total.toFixed(2)}</td>
      <td>${s.timestamp ? s.timestamp.toDate().toLocaleDateString() : 'Pending'}</td>
    </tr>
  `).join('');

  const totalRev = salesHistory.reduce((sum, s) => sum + s.total, 0);
  const totalItems = salesHistory.reduce((sum, s) => sum + s.items.reduce((iSum, i) => iSum + i.qty, 0), 0);

  document.getElementById('report-tx-count').innerText = salesHistory.length;
  document.getElementById('report-total-revenue').innerText = totalRev.toLocaleString();
  document.getElementById('report-items-sold').innerText = totalItems.toLocaleString();
}

// --- Helpers ---
function getStockStatus(m) {
  if (m.qty <= 0) return { label: 'Out of Stock', class: 'badge-red' };
  if (m.qty <= (m.threshold || 10)) return { label: 'Low Stock', class: 'badge-orange' };
  return { label: 'In Stock', class: 'badge-green' };
}

function getExpiryStatus(dateStr) {
  if (!dateStr) return { class: '' };
  const exp = new Date(dateStr);
  const today = new Date();
  const diff = (exp - today) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { class: 'badge badge-red' };
  if (diff <= 30) return { class: 'badge badge-orange' };
  return { class: '' };
}

function showLoading() { loadingOverlay.classList.remove('hidden'); }
function hideLoading() { loadingOverlay.classList.add('hidden'); }

function showError(el, msg) {
  el.innerText = msg;
  setTimeout(() => el.innerText = '', 5000);
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

window.filterInventory = updateInventoryUI;

// Initialize Date
document.getElementById('topbar-date').innerText = new Date().toLocaleDateString('en-US', { 
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
});
