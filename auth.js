import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// Роли пользователей
const ROLES = {
  "freya@semail.com": { name: "Freya", role: "Админ", isAdmin: true },
  "nami@semail.com": { name: "Nami", role: "Админ", isAdmin: true },
  "rinshiro@semail.com": { name: "Rinshiro", role: "ДКС", isAdmin: false },
  "san@semail.com": { name: "San", role: "Логистика", isAdmin: false },
  "niverma@semail.com": { name: "Niverma", role: "Георазведка", isAdmin: false },
  "sepion@semail.com": { name: "Sepion", role: "Спецназ", isAdmin: false }
};

let currentUser = null;

const loginScreen = document.getElementById("login-screen");
const app = document.getElementById("app");
const loginError = document.getElementById("login-error");
const userNameEl = document.getElementById("user-name");
const userRoleEl = document.getElementById("user-role");

// Показать/скрыть пароль
document.getElementById("toggle-password").addEventListener("change", function() {
  const passwordInput = document.getElementById("login-password");
  passwordInput.type = this.checked ? "text" : "password";
});

// Вход
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;

  loginError.textContent = "";

  try {
    await signInWithEmailAndPassword(window.firebaseAuth, email, password);
  } catch (error) {
    loginError.textContent = "Неверный логин или пароль";
    console.error(error);
  }
});

// Наблюдатель
document.getElementById("btn-guest").addEventListener("click", () => {
  currentUser = { name: "Наблюдатель", role: "Гость", isAdmin: false, isGuest: true };
  showApp();
});

// Выход
document.getElementById("btn-logout").addEventListener("click", async () => {
  if (currentUser?.isGuest) {
    location.reload();
  } else {
    await signOut(window.firebaseAuth);
  }
});

// Отслеживание входа
onAuthStateChanged(window.firebaseAuth, (user) => {
  if (user) {
    const info = ROLES[user.email.toLowerCase()] || { 
      name: user.email, 
      role: "Неизвестно", 
      isAdmin: false 
    };
    currentUser = { ...info, email: user.email, isGuest: false };
    showApp();
  } else if (!currentUser?.isGuest) {
    showLogin();
  }
});

function showApp() {
  loginScreen.style.display = "none";
  app.style.display = "block";

  userNameEl.textContent = currentUser.name;
  userRoleEl.textContent = currentUser.role;
  userRoleEl.className = currentUser.isAdmin ? "role-admin" : "role-user";

  // Даём карте знать, что можно инициализироваться
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("user-ready", { detail: currentUser }));
  }, 50);
}

function showLogin() {
  loginScreen.style.display = "flex";
  app.style.display = "none";
  currentUser = null;
}

window.getCurrentUser = () => currentUser;