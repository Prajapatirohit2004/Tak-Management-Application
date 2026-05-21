// client/app.js
// Premium task manager front‑end logic
// Uses fetch API with JWT token stored in localStorage and Socket.io for real‑time updates.

const socket = io(); // auto‑connect to same origin
let token = localStorage.getItem('token') || null;

const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const toggleAuth = document.getElementById('toggleAuth');
const authError = document.getElementById('authError');
const logoutBtn = document.getElementById('logoutBtn');

const appSection = document.getElementById('app');
const tasksContainer = document.getElementById('tasks');
const addTaskBtn = document.getElementById('addTaskBtn');
const newTitle = document.getElementById('newTitle');
const newDesc = document.getElementById('newDesc');

let isRegister = false;

function showAuthModal() {
  authModal.classList.remove('hidden');
  authError.classList.add('hidden');
  authForm.reset();
}

function hideAuthModal() {
  authModal.classList.add('hidden');
}

function showApp() {
  appSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

function hideApp() {
  appSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function setAuthMode(register) {
  isRegister = register;
  authTitle.textContent = register ? 'Register' : 'Login';
  toggleAuth.innerHTML = register ? "Already have an account? <span class='link'>Login</span>" : "No account? <span class='link'>Register</span>";
  const link = toggleAuth.querySelector('.link');
  link.onclick = () => setAuthMode(!register);
}

function displayError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

async function submitAuth(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Auth failed');
    token = data.token;
    localStorage.setItem('token', token);
    hideAuthModal();
    initApp();
  } catch (err) {
    displayError(err.message);
  }
}

async function fetchTasks() {
  const res = await fetch('/api/tasks', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const tasks = await res.json();
  renderTasks(tasks);
}

function renderTasks(tasks) {
  tasksContainer.innerHTML = '';
  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = `task-card ${task.completed ? 'completed' : ''}`;
    card.dataset.id = task.id;
    card.innerHTML = `
      <div class="task-title">${task.title}</div>
      <div class="task-desc">${task.description || ''}</div>
      <div class="task-actions">
        <button class="btn secondary" data-action="toggle">${task.completed ? 'Undo' : 'Done'}</button>
        <button class="btn secondary" data-action="edit">Edit</button>
        <button class="btn secondary" data-action="delete">Del</button>
      </div>
    `;
    tasksContainer.appendChild(card);
  });
}

async function addTask() {
  const title = newTitle.value.trim();
  const description = newDesc.value.trim();
  if (!title) return alert('Title required');
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, description })
  });
  if (res.ok) {
    newTitle.value = '';
    newDesc.value = '';
    // Server will broadcast via socket, but fetch to keep UI consistent
    fetchTasks();
  } else {
    const err = await res.json();
    alert(err.message || 'Failed to add task');
  }
}

async function updateTask(id, updates) {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates)
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.message || 'Update failed');
  }
}

async function deleteTask(id) {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.message || 'Delete failed');
  }
}

// Event delegation for task actions
tasksContainer.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.action;
  const card = btn.closest('.task-card');
  const id = card.dataset.id;
  if (action === 'delete') {
    if (confirm('Delete this task?')) await deleteTask(id);
  } else if (action === 'toggle') {
    const completed = card.classList.toggle('completed') ? 1 : 0;
    await updateTask(id, { completed });
  } else if (action === 'edit') {
    const newTitle = prompt('New title', card.querySelector('.task-title').textContent);
    const newDesc = prompt('New description', card.querySelector('.task-desc').textContent);
    if (newTitle !== null) await updateTask(id, { title: newTitle, description: newDesc });
  }
});

addTaskBtn.addEventListener('click', addTask);
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  token = null;
  hideApp();
  showAuthModal();
});

authForm.addEventListener('submit', submitAuth);

toggleAuth.addEventListener('click', e => {
  if (e.target.classList.contains('link')) {
    setAuthMode(!isRegister);
  }
});

// Socket.io real‑time listeners
socket.on('connect', () => {
  console.log('Socket connected');
});

socket.on('taskCreated', task => {
  fetchTasks(); // simple approach: re‑fetch list
});

socket.on('taskUpdated', task => {
  fetchTasks();
});

socket.on('taskDeleted', data => {
  fetchTasks();
});

function initApp() {
  if (!token) return showAuthModal();
  showApp();
  fetchTasks();
  // send token for socket auth (optional – server currently does not validate socket auth)
  socket.emit('authenticate', { token });
}

// Initial load
initApp();
