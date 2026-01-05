import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

const quoteCards = [
  "Feels like a profile you actually own.",
  "Less pressure, more clarity.",
];

const whyCards = [
  {
    title: "Identity-first",
    body: "Your profile is the home. Posts support it, not the other way around.",
  },
  {
    title: "Signal over noise",
    body: "A feed that respects attention. Fewer distractions, more meaning.",
  },
  {
    title: "Spaces you can shape",
    body: "Create sections, links, and updates that fit who you are today.",
  },
];

const sampleProfile = {
  displayName: "Mika Franco",
  username: "mikefranco",
  profileUrl: "mikefranco",
  status: "Building quietly this week.",
  bio: "Builder. Minimalist. Learning in public. Sharing what matters and staying calm through the noise.",
  location: "Lapu-Lapu City, Cebu",
  interests: [
    "Quiet systems",
    "Product design",
    "Minimal living",
    "City walks",
    "Collaboration",
  ],
  photoUrl: "",
  visibility: "public",
  showLocation: true,
  allowSearch: true,
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "updates", label: "Updates" },
  { id: "links", label: "Links" },
];

const settingsSections = [
  { id: "account", label: "Account" },
  { id: "profile", label: "Profile" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "help", label: "Help" },
];
const settingsSectionIds = new Set(settingsSections.map((section) => section.id));

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const API_KEY = import.meta.env.VITE_API_KEY || "";
const AUTH_STORAGE_KEY = "profilespaces-auth";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9._-]{3,30}$/;
const passwordPattern = /^.{8,}$/;
const RESERVED_HANDLES = new Set([
  "admin",
  "support",
  "profilespaces",
  "profile",
  "settings",
]);

const AuthContext = createContext(null);

const buildApiUrl = (path) => {
  if (path.startsWith("/")) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
};

const truncateMessage = (message, max = 120) => {
  if (!message) return "";
  return message.length > max ? `${message.slice(0, max - 3)}...` : message;
};

const shortMessageFromError = (error) => {
  const data = error?.data || {};
  if (data.errors && typeof data.errors === "object") {
    const firstKey = Object.keys(data.errors)[0];
    if (firstKey && data.errors[firstKey]) {
      return truncateMessage(String(data.errors[firstKey]));
    }
  }
  if (data.detail) {
    return truncateMessage(String(data.detail));
  }
  if (error?.message) {
    return truncateMessage(String(error.message));
  }
  return "Something went wrong. Please try again.";
};

async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    const error = new Error("Unable to reach the server. Please try again.");
    error.data = { detail: networkError.message };
    throw error;
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.detail || "Request failed");
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

async function apiUpload(path, { file, token, fieldName = "photo" } = {}) {
  const headers = {};
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  const formData = new FormData();
  formData.append(fieldName, file);
  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (networkError) {
    const error = new Error("Unable to reach the server. Please try again.");
    error.data = { detail: networkError.message };
    throw error;
  }
  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.detail || "Request failed");
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return payload;
}

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined;
    }
    const mediaQuery = window.matchMedia(query);
    const handleChange = (event) => setMatches(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
};

const useBodyScrollLock = (isLocked) => {
  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isLocked]);
};

const useFocusTrap = (isActive, containerRef, onEscape) => {
  const escapeRef = useRef(onEscape);
  const hasFocused = useRef(false);

  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      hasFocused.current = false;
      return undefined;
    }

    const container = containerRef.current;
    const focusableSelectors =
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

    if (!hasFocused.current) {
      const focusable = Array.from(container.querySelectorAll(focusableSelectors));
      if (focusable.length > 0) {
        focusable[0].focus();
        hasFocused.current = true;
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        escapeRef.current?.();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = Array.from(
        container.querySelectorAll(focusableSelectors)
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      hasFocused.current = false;
    };
  }, [containerRef, isActive]);
};

const useOutsideClick = (isActive, refs, handler) => {
  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const handleClick = (event) => {
      const isInside = refs.some((ref) => ref.current?.contains(event.target));
      if (!isInside) {
        handler();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [handler, isActive, refs]);
};

const useToast = () => {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { toast, showToast };
};

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

const mapUserToProfile = (user) => {
  if (!user) {
    return null;
  }
  return {
    displayName: user.name || user.username || "Profile",
    username: user.username || "",
    profileUrl: user.profile_url || user.profileUrl || user.username || "",
    status: user.status || "",
    bio: user.bio || "",
    location: user.location || "",
    interests: Array.isArray(user.interests) ? user.interests : [],
    photoUrl: user.photo_url || user.photoUrl || "",
    visibility: user.visibility || "public",
    theme: user.theme || "system",
    showLocation: Boolean(user.show_location ?? user.showLocation ?? false),
    allowSearch: Boolean(user.allow_search ?? user.allowSearch ?? false),
  };
};

const validateLogin = (values) => {
  const nextErrors = {};
  const identifier = values.identifier.trim();
  if (!identifier) {
    nextErrors.identifier = "Enter your email or username.";
  } else if (identifier.includes("@") && !emailPattern.test(identifier)) {
    nextErrors.identifier = "Enter a valid email address.";
  } else if (!identifier.includes("@") && !usernamePattern.test(identifier)) {
    nextErrors.identifier = "Use 3-30 letters, numbers, or ._- in your username.";
  }
  if (!values.password) {
    nextErrors.password = "Password is required.";
  }
  return nextErrors;
};

const validateSignup = (values) => {
  const nextErrors = {};
  const name = values.name.trim();
  const username = values.username.trim();
  const email = values.email.trim().toLowerCase();

  if (!name) {
    nextErrors.name = "Name is required.";
  } else if (name.length < 2) {
    nextErrors.name = "Name must be at least 2 characters.";
  }

  if (!username) {
    nextErrors.username = "Choose a username.";
  } else if (!usernamePattern.test(username)) {
    nextErrors.username = "Use 3-30 letters, numbers, or ._- in your username.";
  }

  if (!email) {
    nextErrors.email = "Email is required.";
  } else if (!emailPattern.test(email)) {
    nextErrors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    nextErrors.password = "Create a password.";
  } else if (values.password.length < 8) {
    nextErrors.password = "Password must be at least 8 characters.";
  }

  if (!values.confirm) {
    nextErrors.confirm = "Confirm your password.";
  } else if (values.password !== values.confirm) {
    nextErrors.confirm = "Passwords do not match.";
  }

  if (!values.agree) {
    nextErrors.agree = "Agree to Terms & Privacy.";
  }

  return nextErrors;
};

function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (user?.theme) {
      root.dataset.theme = user.theme;
    } else {
      root.removeAttribute("data-theme");
    }
  }, [user?.theme]);

  const persistAuth = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token: nextToken, user: nextUser })
    );
  }, []);

  const clearAuth = useCallback(() => {
    setToken("");
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiRequest("/auth/logout/", { method: "POST", token });
      }
    } catch (error) {
      // Ignore logout failures and still clear local state
      console.error("Logout failed", error);
    } finally {
      clearAuth();
    }
  }, [clearAuth, token]);

  const refreshSession = useCallback(
    async (providedToken = token, silent = false) => {
      if (!providedToken) {
        setIsRestoring(false);
        return null;
      }
      setIsRestoring(true);
      try {
        const data = await apiRequest("/auth/session/", { token: providedToken });
        persistAuth(providedToken, data.user);
        return data.user;
      } catch (error) {
        if (!silent) {
          throw error;
        }
        clearAuth();
        return null;
      } finally {
        setIsRestoring(false);
      }
    },
    [clearAuth, persistAuth, token]
  );

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) {
      setIsRestoring(false);
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (parsed.token) {
        setToken(parsed.token);
        if (parsed.user) {
          setUser(parsed.user);
        }
        refreshSession(parsed.token, true).catch(() => setIsRestoring(false));
        return;
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    setIsRestoring(false);
  }, [refreshSession]);

  const handleLogin = useCallback(
    async (payload) => {
      const data = await apiRequest("/auth/login/", { method: "POST", body: payload });
      persistAuth(data.token, data.user);
      navigate("/profile");
      return data;
    },
    [navigate, persistAuth]
  );

  const handleSignup = useCallback(
    async (payload) => {
      const data = await apiRequest("/auth/signup/", { method: "POST", body: payload });
      persistAuth(data.token, data.user);
      navigate("/profile");
      return data;
    },
    [navigate, persistAuth]
  );

  const value = useMemo(
    () => ({
      token,
      user,
      isRestoring,
      login: handleLogin,
      signup: handleSignup,
      refreshSession,
      clearAuth,
      persistAuth,
      logout,
      setUser,
      setToken,
    }),
    [clearAuth, handleLogin, handleSignup, isRestoring, logout, persistAuth, refreshSession, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Modal({ isOpen, title, onClose, children, footer }) {
  const dialogRef = useRef(null);

  useFocusTrap(isOpen, dialogRef, onClose);
  useBodyScrollLock(isOpen);
  useOutsideClick(isOpen, [dialogRef], onClose);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal" ref={dialogRef}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-button small" onClick={onClose}>
            x
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
}) {
  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn primary ${danger ? "danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{body}</p>
    </Modal>
  );
}

function ProfileMenu({
  isOpen,
  isMobile,
  anchorRef,
  onClose,
  onNavigate,
  onLogout,
  onCopyLink,
  onShareLink,
}) {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: 0, right: 0 });

  useFocusTrap(isOpen, menuRef, !isMobile ? onClose : undefined);
  useBodyScrollLock(isOpen && isMobile);
  useOutsideClick(isOpen, [menuRef, anchorRef], onClose);

  useEffect(() => {
    if (!isOpen || !anchorRef.current || isMobile) {
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    setMenuStyle({
      top: rect.bottom + 8,
      right: Math.max(window.innerWidth - rect.right, 12),
    });
  }, [anchorRef, isMobile, isOpen]);

  if (!isOpen) {
    return null;
  }

  const menuContent = (
    <div
      className={isMobile ? "menu-sheet" : "menu-dropdown"}
      ref={menuRef}
      style={!isMobile ? menuStyle : undefined}
      role="menu"
    >
      <button type="button" className="menu-item" onClick={() => onNavigate("account")}>
        Account settings
      </button>
      <button type="button" className="menu-item" onClick={() => onNavigate("privacy")}>
        Privacy
      </button>
      <button type="button" className="menu-item" onClick={() => onNavigate("notifications")}>
        Notifications
      </button>
      <button type="button" className="menu-item" onClick={() => onNavigate("appearance")}>
        Appearance
      </button>
      <button type="button" className="menu-item" onClick={() => onNavigate("help")}>
        Help
      </button>
      <div className="menu-divider" />
      <button type="button" className="menu-item" onClick={onCopyLink}>
        Copy profile link
      </button>
      <button type="button" className="menu-item" onClick={onShareLink}>
        Share profile
      </button>
      <div className="menu-divider" />
      <button type="button" className="menu-item danger" onClick={onLogout}>
        Log out
      </button>
    </div>
  );

  return (
    <div className="menu-overlay" aria-hidden={!isOpen}>
      {menuContent}
    </div>
  );
}

function LoginForm({ onSwitchToSignup }) {
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [values, setValues] = useState({
    identifier: "",
    password: "",
    remember: false,
  });

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (formError) {
      setFormError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLogin(values);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await login(values);
    } catch (error) {
      const data = error?.data || {};
      setErrors(data.errors || {});
      setFormError(shortMessageFromError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h3>Welcome back</h3>
      {formError ? <div className="form-error">{formError}</div> : null}
      <label className="field">
        <span>Username or email</span>
        <input
          type="text"
          name="identifier"
          value={values.identifier}
          onChange={handleChange}
          placeholder="you@profilespaces.com"
        />
        {errors.identifier ? (
          <span className="field-error">{errors.identifier}</span>
        ) : null}
      </label>
      <label className="field">
        <span>Password</span>
        <div className="input-row">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            value={values.password}
            onChange={handleChange}
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password ? (
          <span className="field-error">{errors.password}</span>
        ) : null}
      </label>
      <div className="form-row">
        <label className="checkbox">
          <input
            type="checkbox"
            name="remember"
            checked={values.remember}
            onChange={handleChange}
          />
          Remember me
        </label>
        <button type="button" className="text-button muted">
          Forgot password?
        </button>
      </div>
      <button type="submit" className="primary full" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log in"}
      </button>
      <div className="form-links">
        <button
          type="button"
          className="text-button"
          onClick={onSwitchToSignup}
        >
          Create a new account
        </button>
        <span className="microcopy">Secure sign-in. Your profile, your control.</span>
      </div>
    </form>
  );
}

function SignupForm({ onSwitchToLogin }) {
  const { signup } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [values, setValues] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
    agree: false,
  });

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (formError) {
      setFormError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateSignup(values);
    setErrors(nextErrors);
    setFormError("");
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await signup(values);
    } catch (error) {
      const data = error?.data || {};
      setErrors(data.errors || {});
      setFormError(shortMessageFromError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h3>Create account</h3>
      {formError ? <div className="form-error">{formError}</div> : null}
      <label className="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          value={values.name}
          onChange={handleChange}
          placeholder="Your name"
        />
        {errors.name ? <span className="field-error">{errors.name}</span> : null}
      </label>
      <label className="field">
        <span>Username</span>
        <input
          type="text"
          name="username"
          value={values.username}
          onChange={handleChange}
          placeholder="Choose a handle"
        />
        <span className="helper">You can change your username later.</span>
        {errors.username ? (
          <span className="field-error">{errors.username}</span>
        ) : null}
      </label>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          value={values.email}
          onChange={handleChange}
          placeholder="you@profilespaces.com"
        />
        {errors.email ? (
          <span className="field-error">{errors.email}</span>
        ) : null}
      </label>
      <label className="field">
        <span>Password</span>
        <div className="input-row">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            value={values.password}
            onChange={handleChange}
            placeholder="Create a password"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {errors.password ? (
          <span className="field-error">{errors.password}</span>
        ) : null}
      </label>
      <label className="field">
        <span>Confirm password</span>
        <div className="input-row">
          <input
            type={showConfirm ? "text" : "password"}
            name="confirm"
            value={values.confirm}
            onChange={handleChange}
            placeholder="Repeat your password"
          />
          <button
            type="button"
            className="text-button"
            onClick={() => setShowConfirm((prev) => !prev)}
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
        {errors.confirm ? (
          <span className="field-error">{errors.confirm}</span>
        ) : null}
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="agree"
          checked={values.agree}
          onChange={handleChange}
        />
        I agree to Terms & Privacy
      </label>
      {errors.agree ? <span className="field-error">{errors.agree}</span> : null}
      <button type="submit" className="primary full" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create account"}
      </button>
      <div className="form-links">
        <button type="button" className="text-button" onClick={onSwitchToLogin}>
          Log in instead
        </button>
      </div>
    </form>
  );
}

function LandingPage() {
  const { user, isRestoring } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const year = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    if (user && !isRestoring) {
      navigate("/profile", { replace: true });
    }
  }, [isRestoring, navigate, user]);

  useEffect(() => {
    if (user) {
      setSheetOpen(false);
    }
  }, [user]);

  const openSheet = (tab) => {
    setActiveTab(tab);
    setSheetOpen(true);
  };

  return (
    <div className="app landing-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>Profile Spaces</span>
        </div>
        <div className="top-actions">
          <button type="button" className="text-button explore show-desktop">
            Explore
            <span className="explore-dot" aria-hidden="true" />
            <span className="explore-label">View public spaces</span>
          </button>
          <button
            type="button"
            className="ghost show-desktop"
            onClick={() => openSheet("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className="primary show-desktop"
            onClick={() => openSheet("signup")}
          >
            Create account
          </button>
          <button
            type="button"
            className="primary show-mobile"
            onClick={() => openSheet("signup")}
          >
            Get started
          </button>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Your space</p>
            <h1>A calmer place to be seen.</h1>
            <p className="lead">
              Shape an identity-first profile. Share only what matters. Connect
              without the noise.
            </p>
            <div className="cta-row">
              <button
                type="button"
                className="primary"
                onClick={() => openSheet("signup")}
              >
                Create your space
              </button>
            </div>
            <div className="cta-links">
              <button
                type="button"
                className="text-button muted"
                onClick={() => openSheet("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className="text-button muted"
                onClick={() => openSheet("login")}
              >
                I already have an account
              </button>
            </div>
            <p className="trust-line">
              No ads in your feed. No pressure to perform. Just space.
            </p>
          </div>
          <div className="card auth-card">
            <LoginForm onSwitchToSignup={() => openSheet("signup")} />
          </div>
          <img
            className="hero-logo"
            src="/brand-logo.png"
            alt=""
            aria-hidden="true"
          />
        </section>

        <section className="section why">
          <div className="section-header">
            <h2>Why Profile Spaces</h2>
            <p className="muted">
              Built for people who want a calmer social home.
            </p>
          </div>
          <div className="card-grid">
            {whyCards.map((card) => (
              <article className="card" key={card.title}>
                <h3>{card.title}</h3>
                <p className="muted">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section preview">
          <div className="section-header">
            <h2>Designed to feel quiet and premium.</h2>
            <p className="muted">
              Clean cards, thoughtful spacing, and a UI that stays out of the way.
            </p>
          </div>
          <div className="preview-card">
            <div className="preview-header">
              <span className="avatar" />
              <div>
                <p className="name">Avery Blake</p>
                <p className="meta">Quiet creator - @avery</p>
              </div>
              <button type="button" className="ghost small">
                Follow
              </button>
            </div>
            <div className="preview-body">
              <div className="preview-block" />
              <div className="preview-block short" />
              <div className="preview-tags">
                <span className="tag">Identity</span>
                <span className="tag">Focus</span>
                <span className="tag">Calm</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section proof">
          <div className="section-header">
            <h2>Quiet by design</h2>
            <p className="muted">
              Private by default. Built for signal, not noise.
            </p>
          </div>
          <div className="card-grid two">
            {quoteCards.map((quote) => (
              <article className="card quote" key={quote}>
                "{quote}"
              </article>
            ))}
          </div>
        </section>

        <section className="section final-cta card">
          <div>
            <h2>Start your space in minutes.</h2>
            <p className="muted">
              Create a profile that feels like you. Add what matters. Leave the
              rest out.
            </p>
          </div>
          <div className="cta-row">
            <button
              type="button"
              className="primary"
              onClick={() => openSheet("signup")}
            >
              Create account
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => openSheet("login")}
            >
              Log in
            </button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-links">
          <button type="button" className="text-button muted">
            About
          </button>
          <button type="button" className="text-button muted">
            Privacy
          </button>
          <button type="button" className="text-button muted">
            Terms
          </button>
          <button type="button" className="text-button muted">
            Contact
          </button>
          <button type="button" className="text-button muted">
            Status
          </button>
        </div>
        <p className="microcopy">
          (c) {year} Profile Spaces. A quieter social home.
        </p>
      </footer>

      <div className={`sheet-overlay ${sheetOpen ? "open" : ""}`}>
        <div className="sheet">
          <div className="sheet-header">
            <div className="tabs">
              <button
                type="button"
                className={activeTab === "login" ? "active" : ""}
                onClick={() => setActiveTab("login")}
              >
                Log in
              </button>
              <button
                type="button"
                className={activeTab === "signup" ? "active" : ""}
                onClick={() => setActiveTab("signup")}
              >
                Sign up
              </button>
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => setSheetOpen(false)}
            >
              Close
            </button>
          </div>
          {activeTab === "login" ? (
            <LoginForm onSwitchToSignup={() => setActiveTab("signup")} />
          ) : (
            <SignupForm onSwitchToLogin={() => setActiveTab("login")} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { user, isRestoring, logout, setUser, token } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 959px)");
  const [activeTab, setActiveTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [statusEditing, setStatusEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const menuButtonRef = useRef(null);
  const { toast, showToast } = useToast();
  const toastMessage = toast?.message || "";
  const toastType = toast?.type || "info";
  const isOwner = Boolean(user);
  const isLoading = isRestoring && !user;
  const profileData = mapUserToProfile(user) || sampleProfile;
  const profileSlug = profileData.profileUrl || profileData.username || "your-space";
  const profileUrl = `profilespaces.com/${profileSlug}`;
  const fullProfileUrl = `https://${profileUrl}`;
  const isPrivateProfile = profileData.visibility === "private";
  const showProfileDetails = !isPrivateProfile || isOwner;
  const canShowLocation = Boolean(profileData.location) && profileData.showLocation;
  const displayBio = profileData.bio
    ? profileData.bio.length > 160
      ? profileData.bio.slice(0, 160)
      : profileData.bio
    : isOwner
      ? "Add a short bio to introduce yourself."
      : "This space is warming up.";
  const interests = profileData.interests ? profileData.interests.slice(0, 5) : [];
  const initials = (profileData.displayName || profileData.username || "PS")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusText =
    profileData.status ||
    (isOwner ? "Set a status to share how you're doing." : "This profile is quiet for now.");
  const statusLimit = 80;

  useEffect(() => {
    setStatusDraft(profileData.status || "");
  }, [profileData.status]);

  useEffect(() => {
    const shouldNoIndex = isPrivateProfile || !profileData.allowSearch;
    let meta = document.querySelector('meta[name="robots"]');
    let created = false;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
      created = true;
    }
    meta.setAttribute("content", shouldNoIndex ? "noindex, nofollow" : "index, follow");
    return () => {
      if (created && meta) {
        meta.remove();
      }
    };
  }, [isPrivateProfile, profileData.allowSearch]);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(fullProfileUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = fullProfileUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast("Link copied");
    } catch (error) {
      showToast("Unable to copy link", "error");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profileData.displayName} on Profile Spaces`,
          url: fullProfileUrl,
        });
        showToast("Link copied");
        return;
      } catch {
        // ignore share cancellation
      }
    }
    handleCopy();
  };

  const handleLogout = useCallback(async () => {
    await logout();
    showToast("Logged out", "info");
    navigate("/", { replace: true });
  }, [logout, navigate, showToast]);

  const handleStatusSave = async () => {
    const nextStatus = statusDraft.trim().slice(0, statusLimit);
    if (!user || !token) {
      setStatusEditing(false);
      showToast("Session expired. Please log in again.", "warning");
      return;
    }
    try {
      const payload = {
        display_name: profileData.displayName,
        username: profileData.username,
        profile_url: profileData.profileUrl || profileData.username,
        status: nextStatus,
        bio: profileData.bio,
        location: profileData.location,
        interests: profileData.interests,
      };
      const data = await apiRequest("/auth/profile/", {
        method: "PATCH",
        token,
        body: payload,
      });
      if (data?.user) {
        setUser(data.user);
      } else if (user) {
        setUser({ ...user, status: nextStatus });
      }
      setStatusEditing(false);
      showToast("Profile updated successfully.");
    } catch (error) {
      showToast(shortMessageFromError(error), "error");
    }
  };

  const handleMenuNavigate = (section) => {
    setMenuOpen(false);
    navigate(`/settings?tab=${section}`);
  };

  useEffect(() => {
    if (!isRestoring && !user) {
      navigate("/", { replace: true });
    }
  }, [isRestoring, navigate, user]);

  if (!user && isRestoring) {
    return (
      <div className="app profile-app">
        <main className="profile-main">
          <div className="profile-grid">
            <aside className="identity-column">
              <section className="card identity-card reveal" style={{ "--delay": "0s" }}>
                <div className="skeleton-stack" aria-hidden="true">
                  <div className="skeleton-circle" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                  <div className="skeleton-pill" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-tags">
                    <span className="skeleton-chip" />
                    <span className="skeleton-chip" />
                    <span className="skeleton-chip" />
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app profile-app">
      <header className="profile-topbar">
        <Link to="/" className="icon-button" aria-label="Back to landing">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <span className="top-title">Profile</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Profile menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
          ref={menuButtonRef}
        >
          <span aria-hidden="true">...</span>
        </button>
      </header>
      <ProfileMenu
        isOpen={menuOpen}
        isMobile={isMobile}
        anchorRef={menuButtonRef}
        onClose={() => setMenuOpen(false)}
        onNavigate={handleMenuNavigate}
        onLogout={() => {
          setMenuOpen(false);
          setLogoutConfirmOpen(true);
        }}
        onCopyLink={() => {
          setMenuOpen(false);
          handleCopy();
        }}
        onShareLink={() => {
          setMenuOpen(false);
          handleShare();
        }}
      />

      <main className="profile-main">
        <div className="profile-grid">
          <aside className="identity-column">
            <section className="card identity-card reveal" style={{ "--delay": "0s" }}>
              {isLoading ? (
                <div className="skeleton-stack" aria-hidden="true">
                  <div className="skeleton-circle" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                  <div className="skeleton-pill" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-line wide" />
                  <div className="skeleton-tags">
                    <span className="skeleton-chip" />
                    <span className="skeleton-chip" />
                    <span className="skeleton-chip" />
                  </div>
                </div>
              ) : showProfileDetails ? (
                <>
                  <div className="avatar-wrap">
                    <div className="avatar" role="img" aria-label="Profile photo">
                      {profileData.photoUrl ? (
                        <img src={profileData.photoUrl} alt="Profile photo" />
                      ) : (
                        initials
                      )}
                    </div>
                  </div>
                  <div className="identity-text">
                    <h1>{profileData.displayName}</h1>
                    <p className="username">@{profileData.username || "your-handle"}</p>
                  </div>
                  <div className="url-row">
                    <span className="url-text">{profileUrl}</span>
                    <button type="button" className="btn ghost" onClick={handleCopy}>
                      Copy
                    </button>
                  </div>
                  <div className="status-block">
                    {statusEditing ? (
                      <div className="status-editor">
                        <input
                          type="text"
                          value={statusDraft}
                          maxLength={statusLimit}
                          onChange={(event) => setStatusDraft(event.target.value)}
                          placeholder="Set a status"
                        />
                        <div className="status-actions">
                          <button
                            type="button"
                            className="btn primary small"
                            onClick={handleStatusSave}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => {
                              setStatusDraft(profileData.status || "");
                              setStatusEditing(false);
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        <span className="helper">{statusDraft.length}/{statusLimit}</span>
                      </div>
                    ) : isOwner ? (
                      <button
                        type="button"
                        className="status-pill status-action"
                        onClick={() => setStatusEditing(true)}
                      >
                        {statusText}
                      </button>
                    ) : (
                      <div className="status-pill">{statusText}</div>
                    )}
                  </div>
                  <p className="bio">{displayBio}</p>
                  {canShowLocation ? (
                    <div className="location-row">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <circle cx="12" cy="11" r="2.5" fill="currentColor" />
                      </svg>
                      <span>{profileData.location}</span>
                    </div>
                  ) : null}
                  {isOwner ? (
                    <div className="action-row desktop-actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => navigate("/settings?tab=profile")}
                      >
                        Edit profile
                      </button>
                      <button type="button" className="btn ghost" onClick={handleShare}>
                        Share profile
                      </button>
                    </div>
                  ) : null}
                  {isOwner ? (
                    <div className="account-links">
                      <button type="button" className="text-button muted" onClick={() => navigate("/settings")}>
                        Account settings
                      </button>
                      <button
                        type="button"
                        className="text-button muted"
                        onClick={() => setLogoutConfirmOpen(true)}
                      >
                        Log out
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <h3>This profile is private.</h3>
                  <p>Only the owner can view details.</p>
                </div>
              )}
            </section>
            {showProfileDetails ? (
              <section className="card interests-card reveal" style={{ "--delay": "0.04s" }}>
                <div className="card-header row">
                  <h2>Interests</h2>
                  {isOwner && interests.length === 0 ? (
                    <button
                      type="button"
                      className="text-button muted"
                      onClick={() => navigate("/settings?tab=profile")}
                    >
                      Add interests
                    </button>
                  ) : null}
                </div>
                {interests.length > 0 ? (
                  <div className="tag-row">
                    {interests.map((tag) => (
                      <span className="tag" key={`${tag}-interest`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">
                    Add up to five interests to surface what you care about.
                  </p>
                )}
              </section>
            ) : null}
          </aside>

          <section className="content-column">
            {showProfileDetails ? (
              <>
                <div className="tab-row reveal" style={{ "--delay": "0.08s" }}>
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === "overview" ? (
                  <div className="tab-content">
                    <section className="card content-card reveal" style={{ "--delay": "0.12s" }}>
                      <div className="card-header">
                        <h2>About</h2>
                        <p className="muted">Status, bio, and the details that matter.</p>
                      </div>
                      <div className="about-stack">
                        <div className="status-pill">{statusText}</div>
                        <p className="bio">{displayBio}</p>
                        {canShowLocation ? (
                          <div className="location">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                              />
                              <circle cx="12" cy="11" r="2.5" fill="currentColor" />
                            </svg>
                            <span>{profileData.location}</span>
                          </div>
                        ) : null}
                        <div className="tag-row">
                          {interests.map((tag) => (
                            <span className="tag" key={`${tag}-about`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className="card content-card reveal" style={{ "--delay": "0.16s" }}>
                      <div className="card-header">
                        <h2>Recent activity</h2>
                        <p className="muted">A calm feed of updates will live here.</p>
                      </div>
                      <div className="empty-state">
                        <h3>No updates yet.</h3>
                        <p>When you share an update, it will appear here.</p>
                        <span className="muted">Updates are coming soon.</span>
                      </div>
                    </section>
                  </div>
                ) : activeTab === "updates" ? (
                  <section className="card content-card reveal" style={{ "--delay": "0.12s" }}>
                    <div className="empty-state">
                      <h3>Updates are coming soon.</h3>
                      <p>Keep your profile calm while we build out posts.</p>
                    </div>
                  </section>
                ) : (
                  <section className="card content-card reveal" style={{ "--delay": "0.12s" }}>
                    <div className="empty-state">
                      <h3>Links are coming soon.</h3>
                      <p>Curate the places you want to share here.</p>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <section className="card content-card reveal" style={{ "--delay": "0.12s" }}>
                <div className="empty-state">
                  <h3>This profile is private.</h3>
                  <p>Only the owner can view details.</p>
                </div>
              </section>
            )}
          </section>
        </div>

        {isOwner ? (
          <div className="action-row mobile-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => navigate("/settings?tab=profile")}
            >
              Edit profile
            </button>
            <button type="button" className="btn ghost" onClick={handleShare}>
              Share profile
            </button>
          </div>
        ) : null}
      </main>

      <div
        className={`toast ${toastMessage ? "show" : ""} ${toastType}`}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>
      <ConfirmDialog
        isOpen={logoutConfirmOpen}
        title="Log out?"
        body="You'll be signed out of Profile Spaces on this device."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          handleLogout();
        }}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    </div>
  );
}

function SettingsPage() {
  const { user, isRestoring, token, persistAuth, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 959px)");
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast } = useToast();
  const toastMessage = toast?.message || "";
  const toastType = toast?.type || "info";
  const lastActiveElement = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const resolveSection = useCallback(
    (tabValue) => (settingsSectionIds.has(tabValue) ? tabValue : "account"),
    []
  );
  const [activeSection, setActiveSection] = useState(() =>
    resolveSection(searchParams.get("tab"))
  );
  const [showMobileList, setShowMobileList] = useState(isMobile);
  const [pendingSection, setPendingSection] = useState(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteValue, setDeleteValue] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});
  const [emailErrors, setEmailErrors] = useState({});
  const [interestInput, setInterestInput] = useState("");
  const [availability, setAvailability] = useState({
    username: "neutral",
    profileUrl: "neutral",
  });
  const availabilityRequestRef = useRef({ username: 0, profileUrl: 0 });
  const hasProfileChangesRef = useRef(false);
  const hasPrivacyChangesRef = useRef(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [emailDraft, setEmailDraft] = useState({
    email: "",
    password: "",
  });
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);

  const baseProfile = useMemo(
    () => mapUserToProfile(user) || sampleProfile,
    [user]
  );

  const buildDefaults = useCallback(() => {
    return {
      displayName: baseProfile.displayName || "",
      username: baseProfile.username || "",
      profileUrl: baseProfile.profileUrl || baseProfile.username || "",
      bio: baseProfile.bio || "",
      location: baseProfile.location || "",
      interests: baseProfile.interests || [],
      status: baseProfile.status || "",
      photoUrl: baseProfile.photoUrl || "",
      visibility: baseProfile.visibility || "public",
      showLocation: Boolean(baseProfile.showLocation && baseProfile.location),
      allowSearch: Boolean(baseProfile.allowSearch),
      emailNotifications: true,
      productUpdates: true,
      newFollowerAlerts: false,
      weeklyDigest: false,
      pauseNotifications: "off",
      theme: baseProfile.theme || "system",
    };
  }, [baseProfile]);

  const [saved, setSaved] = useState(buildDefaults);
  const [draft, setDraft] = useState(buildDefaults);

  const applyNotificationPrefs = useCallback((prefs) => {
    if (!prefs || typeof prefs !== "object") {
      return;
    }
    setSaved((prev) => ({
      ...prev,
      emailNotifications:
        prefs.email_notifications ?? prefs.emailNotifications ?? prev.emailNotifications ?? true,
      productUpdates:
        prefs.product_updates ?? prefs.productUpdates ?? prev.productUpdates ?? true,
      newFollowerAlerts:
        prefs.new_follower_alerts ?? prefs.newFollowerAlerts ?? prev.newFollowerAlerts ?? false,
      weeklyDigest: prefs.weekly_digest ?? prefs.weeklyDigest ?? prev.weeklyDigest ?? false,
      pauseNotifications:
        prefs.pause_notifications ?? prefs.pauseNotifications ?? prev.pauseNotifications ?? "off",
    }));
    setDraft((prev) => ({
      ...prev,
      emailNotifications:
        prefs.email_notifications ?? prefs.emailNotifications ?? prev.emailNotifications ?? true,
      productUpdates:
        prefs.product_updates ?? prefs.productUpdates ?? prev.productUpdates ?? true,
      newFollowerAlerts:
        prefs.new_follower_alerts ?? prefs.newFollowerAlerts ?? prev.newFollowerAlerts ?? false,
      weeklyDigest: prefs.weekly_digest ?? prefs.weeklyDigest ?? prev.weeklyDigest ?? false,
      pauseNotifications:
        prefs.pause_notifications ?? prefs.pauseNotifications ?? prev.pauseNotifications ?? "off",
    }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const next = buildDefaults();
    setSaved(next);
    setDraft(next);
    setAvailability({ username: "neutral", profileUrl: "neutral" });
    setNotificationsLoaded(false);
  }, [buildDefaults]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const nextSection = resolveSection(tab);
    if (nextSection !== activeSection) {
      setActiveSection(nextSection);
    }
    if (isMobile) {
      setShowMobileList(!tab);
    } else {
      setShowMobileList(false);
    }
    if (!tab || !settingsSectionIds.has(tab)) {
      if (!isMobile) {
        setSearchParams({ tab: nextSection }, { replace: true });
      }
    }
  }, [activeSection, isMobile, resolveSection, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isRestoring && !user) {
      navigate("/", { replace: true });
    }
  }, [isRestoring, navigate, user]);

  useEffect(() => {
    const hasChanges = JSON.stringify(saved) !== JSON.stringify(draft);
    window.onbeforeunload = hasChanges ? () => "Discard changes?" : null;
    return () => {
      window.onbeforeunload = null;
    };
  }, [draft, saved]);

  useEffect(() => {
    if (changeEmailOpen) {
      setEmailDraft({ email: "", password: "" });
      setEmailErrors({});
      setShowEmailPassword(false);
    }
  }, [changeEmailOpen]);

  useEffect(() => {
    if (!user || !token || isRestoring) {
      return;
    }
    if (notificationsLoaded || activeSection !== "notifications") {
      return;
    }
    let isActive = true;
    const loadNotifications = async () => {
      try {
        const data = await apiRequest("/auth/notifications/", { token });
        if (!isActive) {
          return;
        }
        applyNotificationPrefs(data?.notifications || {});
      } catch (error) {
        if (isActive) {
          showToast(shortMessageFromError(error), "error");
        }
      } finally {
        if (isActive) {
          setNotificationsLoaded(true);
        }
      }
    };
    loadNotifications();
    return () => {
      isActive = false;
    };
  }, [
    activeSection,
    applyNotificationPrefs,
    isRestoring,
    notificationsLoaded,
    showToast,
    token,
    user,
  ]);

  const rememberFocus = (event) => {
    lastActiveElement.current = event?.currentTarget || document.activeElement;
  };

  const restoreFocus = () => {
    const element = lastActiveElement.current;
    if (element && typeof element.focus === "function") {
      element.focus();
    }
  };

  const sectionFieldMap = {
    profile: [
      "displayName",
      "username",
      "profileUrl",
      "bio",
      "location",
      "interests",
      "status",
      "photoUrl",
    ],
    privacy: ["visibility", "showLocation", "allowSearch"],
    notifications: [
      "emailNotifications",
      "productUpdates",
      "newFollowerAlerts",
      "weeklyDigest",
      "pauseNotifications",
    ],
    appearance: ["theme"],
  };

  const hasSectionChanges = (sectionId) => {
    const fields = sectionFieldMap[sectionId] || [];
    return fields.some(
      (field) => JSON.stringify(saved[field]) !== JSON.stringify(draft[field])
    );
  };

  const hasProfileChanges = hasSectionChanges("profile");
  const hasPrivacyChanges = hasSectionChanges("privacy");

  useEffect(() => {
    hasProfileChangesRef.current = hasProfileChanges;
  }, [hasProfileChanges]);

  useEffect(() => {
    hasPrivacyChangesRef.current = hasPrivacyChanges;
  }, [hasPrivacyChanges]);

  useEffect(() => {
    let isActive = true;
    const loadProfile = async () => {
      const shouldLoad = activeSection === "profile" || activeSection === "privacy";
      if (!token || !user || !shouldLoad || hasProfileChanges || hasPrivacyChanges) {
        return;
      }
      setProfileLoading(true);
      try {
        const data = await apiRequest("/auth/profile/", { token });
        const profile = data?.profile;
        if (!profile || !isActive) {
          return;
        }
        if (hasProfileChangesRef.current || hasPrivacyChangesRef.current) {
          return;
        }
        const nextFields = {
          displayName: profile.display_name || "",
          username: profile.username || "",
          profileUrl: profile.profile_url || "",
          status: profile.status || "",
          bio: profile.bio || "",
          location: profile.location || "",
          interests: Array.isArray(profile.interests) ? profile.interests : [],
          photoUrl: profile.photo_url || "",
          visibility: profile.visibility || "public",
          theme: profile.theme || "system",
          showLocation: Boolean(profile.show_location && profile.location),
          allowSearch: Boolean(profile.allow_search),
        };
        setSaved((prev) => ({ ...prev, ...nextFields }));
        setDraft((prev) => ({ ...prev, ...nextFields }));
        setInterestInput("");
        setAvailability({ username: "neutral", profileUrl: "neutral" });
        if (data?.user) {
          setUser(data.user);
        }
      } catch (error) {
        if (isActive) {
          showToast(shortMessageFromError(error), "error");
        }
      } finally {
        if (isActive) {
          setProfileLoading(false);
        }
      }
    };
    loadProfile();
    return () => {
      isActive = false;
    };
  }, [activeSection, token, user, showToast, setUser, hasProfileChanges, hasPrivacyChanges]);

  const applySection = useCallback(
    (sectionId) => {
      if (!settingsSectionIds.has(sectionId)) {
        return;
      }
      setActiveSection(sectionId);
      setSearchParams({ tab: sectionId }, { replace: true });
      if (isMobile) {
        setShowMobileList(false);
      }
    },
    [isMobile, setSearchParams]
  );

  const handleSectionChange = (sectionId) => {
    if (sectionId === activeSection) {
      if (isMobile) {
        setShowMobileList(false);
      }
      return;
    }
    if (hasSectionChanges(activeSection)) {
      rememberFocus();
      setPendingSection(sectionId);
      setDiscardOpen(true);
      return;
    }
    applySection(sectionId);
  };

  const handleDiscardCancel = () => {
    setDiscardOpen(false);
    setPendingSection(null);
    restoreFocus();
  };

  const handleBackToList = () => {
    if (hasSectionChanges(activeSection)) {
      rememberFocus();
      setPendingSection("list");
      setDiscardOpen(true);
      return;
    }
    setPendingSection(null);
    setShowMobileList(true);
    setSearchParams({}, { replace: true });
  };

  const checkAvailability = useCallback(
    async (field, value) => {
      const trimmed = value.trim();
      const normalized = trimmed.toLowerCase();
      if (!trimmed || !usernamePattern.test(trimmed)) {
        setAvailability((prev) => ({ ...prev, [field]: "neutral" }));
        return "neutral";
      }
      const savedValue =
        field === "username"
          ? saved.username.trim().toLowerCase()
          : saved.profileUrl.trim().toLowerCase();
      if (savedValue && normalized === savedValue) {
        setAvailability((prev) => ({ ...prev, [field]: "success" }));
        return "success";
      }
      if (RESERVED_HANDLES.has(normalized)) {
        setAvailability((prev) => ({ ...prev, [field]: "error" }));
        return "error";
      }
      if (!token) {
        setAvailability((prev) => ({ ...prev, [field]: "neutral" }));
        return "neutral";
      }
      const nextId = availabilityRequestRef.current[field] + 1;
      availabilityRequestRef.current[field] = nextId;
      try {
        const endpoint =
          field === "username"
            ? `/auth/profile/username/?username=${encodeURIComponent(trimmed)}`
            : `/auth/profile/url/?profile_url=${encodeURIComponent(trimmed)}`;
        const data = await apiRequest(endpoint, { token });
        if (availabilityRequestRef.current[field] !== nextId) {
          return "neutral";
        }
        if (data?.available) {
          setAvailability((prev) => ({ ...prev, [field]: "success" }));
          return "success";
        }
        setAvailability((prev) => ({ ...prev, [field]: "error" }));
        return "error";
      } catch {
        if (availabilityRequestRef.current[field] === nextId) {
          setAvailability((prev) => ({ ...prev, [field]: "neutral" }));
        }
        return "neutral";
      }
    },
    [saved.profileUrl, saved.username, token]
  );

  const validateAvailability = async () => {
    const [usernameStatus, profileUrlStatus] = await Promise.all([
      checkAvailability("username", draft.username),
      checkAvailability("profileUrl", draft.profileUrl),
    ]);
    return usernameStatus !== "error" && profileUrlStatus !== "error";
  };

  const validateProfile = () => {
    const nextErrors = {};
    if (!draft.displayName.trim()) {
      nextErrors.displayName = "Display name is required.";
    } else if (draft.displayName.trim().length < 2) {
      nextErrors.displayName = "Display name must be at least 2 characters.";
    }
    if (!draft.username.trim()) {
      nextErrors.username = "Username is required.";
    } else if (!usernamePattern.test(draft.username.trim())) {
      nextErrors.username = "Use 3-30 letters, numbers, or ._- in your username.";
    }
    if (!draft.profileUrl.trim()) {
      nextErrors.profileUrl = "Profile URL base is required.";
    } else if (!usernamePattern.test(draft.profileUrl.trim())) {
      nextErrors.profileUrl = "Profile URL must match username rules.";
    }
    if (draft.bio.length > 160) {
      nextErrors.bio = "Bio must be 160 characters or less.";
    }
    if (draft.status.length > 80) {
      nextErrors.status = "Status must be 80 characters or less.";
    }
    if (draft.interests.length > 5) {
      nextErrors.interests = "Add up to 5 interests.";
    }
    setProfileErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!hasSectionChanges(activeSection)) {
      return;
    }
    if (activeSection === "profile") {
      if (!validateProfile()) {
        return;
      }
      setIsSaving(true);
      try {
        const canSave = await validateAvailability();
        if (!canSave) {
          return;
        }
        if (!token) {
          showToast("Session expired. Please log in again.", "warning");
          return;
        }
        const payload = {
          display_name: draft.displayName.trim(),
          username: draft.username.trim(),
          profile_url: draft.profileUrl.trim(),
          status: draft.status.trim(),
          bio: draft.bio.trim(),
          location: draft.location.trim(),
          interests: draft.interests,
          theme: draft.theme,
        };
        const data = await apiRequest("/auth/profile/", {
          method: "PATCH",
          token,
          body: payload,
        });
        const profile = data?.profile;
        if (profile) {
          const nextFields = {
            displayName: profile.display_name || "",
            username: profile.username || "",
            profileUrl: profile.profile_url || "",
            status: profile.status || "",
            bio: profile.bio || "",
            location: profile.location || "",
            interests: Array.isArray(profile.interests) ? profile.interests : [],
            photoUrl: profile.photo_url || "",
            visibility: profile.visibility || saved.visibility || "public",
            theme: profile.theme || saved.theme || "system",
            showLocation: Boolean(profile.show_location && (profile.location || saved.location)),
            allowSearch: Boolean(profile.allow_search ?? saved.allowSearch),
          };
          setSaved((prev) => ({ ...prev, ...nextFields }));
          setDraft((prev) => ({ ...prev, ...nextFields }));
          setInterestInput("");
        }
        if (data?.user) {
          setUser(data.user);
        }
        setProfileErrors({});
        setAvailability({ username: "neutral", profileUrl: "neutral" });
        showToast("Profile updated successfully.");
      } catch (error) {
        const apiErrors = error?.data?.errors || {};
        const mappedErrors = {};
        if (apiErrors.display_name) {
          mappedErrors.displayName = apiErrors.display_name;
        }
        if (apiErrors.username) {
          mappedErrors.username = apiErrors.username;
        }
        if (apiErrors.profile_url) {
          mappedErrors.profileUrl = apiErrors.profile_url;
        }
        if (apiErrors.status) {
          mappedErrors.status = apiErrors.status;
        }
        if (apiErrors.bio) {
          mappedErrors.bio = apiErrors.bio;
        }
        if (apiErrors.location) {
          mappedErrors.location = apiErrors.location;
        }
        if (apiErrors.interests) {
          mappedErrors.interests = apiErrors.interests;
        }
        if (Object.keys(mappedErrors).length > 0) {
          setProfileErrors(mappedErrors);
        }
        showToast(shortMessageFromError(error), "error");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (activeSection === "privacy") {
      setIsSaving(true);
      try {
        if (!token) {
          showToast("Session expired. Please log in again.", "warning");
          return;
        }
        const payload = {
          display_name: saved.displayName,
          username: saved.username,
          profile_url: saved.profileUrl,
          status: saved.status,
          bio: saved.bio,
          location: saved.location,
          interests: saved.interests,
          visibility: draft.visibility,
          show_location: draft.showLocation,
          allow_search: draft.allowSearch,
        };
        const data = await apiRequest("/auth/profile/", {
          method: "PATCH",
          token,
          body: payload,
        });
        const profile = data?.profile;
        if (profile) {
          const nextFields = {
            visibility: profile.visibility || "public",
            showLocation: Boolean(profile.show_location && (profile.location || saved.location)),
            allowSearch: Boolean(profile.allow_search),
          };
          setSaved((prev) => ({ ...prev, ...nextFields }));
          setDraft((prev) => ({ ...prev, ...nextFields }));
        } else {
          setSaved((prev) => ({
            ...prev,
            visibility: draft.visibility,
            showLocation: draft.showLocation,
            allowSearch: draft.allowSearch,
          }));
        }
        if (data?.user) {
          setUser(data.user);
        }
        showToast("Privacy settings updated.");
      } catch (error) {
        showToast(shortMessageFromError(error), "error");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (activeSection === "notifications") {
      if (!token) {
        showToast("Session expired. Please log in again.", "warning");
        return;
      }
      setIsSaving(true);
      try {
        const data = await apiRequest("/auth/notifications/", {
          method: "PATCH",
          token,
          body: {
            email_notifications: draft.emailNotifications,
            product_updates: draft.productUpdates,
            new_follower_alerts: draft.newFollowerAlerts,
            weekly_digest: draft.weeklyDigest,
            pause_notifications: draft.pauseNotifications,
          },
        });
        applyNotificationPrefs(data?.notifications || {});
        showToast("Notification preferences updated.");
      } catch (error) {
        showToast(shortMessageFromError(error), "error");
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (activeSection === "appearance") {
      if (!token) {
        showToast("Session expired. Please log in again.", "warning");
        return;
      }
      setIsSaving(true);
      try {
        const payload = {
          display_name: saved.displayName,
          username: saved.username,
          profile_url: saved.profileUrl,
          status: saved.status,
          bio: saved.bio,
          location: saved.location,
          interests: saved.interests,
          visibility: saved.visibility,
          show_location: saved.showLocation,
          allow_search: saved.allowSearch,
          theme: draft.theme,
        };
        const data = await apiRequest("/auth/profile/", {
          method: "PATCH",
          token,
          body: payload,
        });
        const profile = data?.profile;
        if (profile) {
          const nextFields = {
            theme: profile.theme || draft.theme || "system",
          };
          setSaved((prev) => ({ ...prev, ...nextFields }));
          setDraft((prev) => ({ ...prev, ...nextFields }));
        } else {
          setSaved((prev) => ({ ...prev, theme: draft.theme }));
        }
        if (data?.user) {
          setUser(data.user);
        }
        showToast("Appearance updated.");
      } catch (error) {
        showToast(shortMessageFromError(error), "error");
      } finally {
        setIsSaving(false);
      }
      return;
    }

    setIsSaving(true);
    setTimeout(() => {
      setSaved(draft);
      showToast("Settings saved.");
      setIsSaving(false);
    }, 650);
  };

  const handleCancel = () => {
    setDraft(saved);
    setProfileErrors({});
    setInterestInput("");
    setAvailability({ username: "neutral", profileUrl: "neutral" });
  };

  const handleLogout = useCallback(async () => {
    await logout();
    showToast("Logged out", "info");
    navigate("/", { replace: true });
  }, [logout, navigate, showToast]);

  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (!trimmed) {
      return;
    }
    const next = draft.interests.slice();
    if (next.includes(trimmed) || next.length >= 5) {
      return;
    }
    next.push(trimmed);
    setDraft((prev) => ({ ...prev, interests: next }));
    setInterestInput("");
  };

  const handleRemoveInterest = (tag) => {
    setDraft((prev) => ({
      ...prev,
      interests: prev.interests.filter((item) => item !== tag),
    }));
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!token) {
      showToast("Session expired. Please log in again.", "warning");
      return;
    }
    setPhotoUploading(true);
    try {
      const data = await apiUpload("/auth/profile/photo/", { file, token });
      const photoUrl = data?.photo_url || "";
      setDraft((prev) => ({ ...prev, photoUrl }));
      setSaved((prev) => ({ ...prev, photoUrl }));
      if (data?.user) {
        setUser(data.user);
      }
      showToast("Profile photo updated.");
    } catch (error) {
      showToast(shortMessageFromError(error), "error");
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const handlePhotoRemove = async () => {
    if (!token) {
      showToast("Session expired. Please log in again.", "warning");
      return;
    }
    setPhotoUploading(true);
    try {
      await apiRequest("/auth/profile/photo/delete/", { method: "DELETE", token });
      setDraft((prev) => ({ ...prev, photoUrl: "" }));
      setSaved((prev) => ({ ...prev, photoUrl: "" }));
      if (user) {
        setUser({ ...user, photo_url: "", photoUrl: "" });
      }
      showToast("Profile photo removed.");
    } catch (error) {
      showToast(shortMessageFromError(error), "error");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePasswordSave = async () => {
    const nextErrors = {};
    if (!passwordDraft.current) {
      nextErrors.current = "Enter your current password.";
    }
    if (!passwordDraft.next) {
      nextErrors.next = "Create a new password.";
    } else if (!passwordPattern.test(passwordDraft.next)) {
      nextErrors.next = "Use at least 8 characters.";
    }
    if (!passwordDraft.confirm) {
      nextErrors.confirm = "Confirm your new password.";
    } else if (passwordDraft.confirm !== passwordDraft.next) {
      nextErrors.confirm = "Passwords do not match.";
    }
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!token) {
      showToast("Session expired. Please log in again.", "warning");
      return;
    }
    setPasswordSaving(true);
    try {
      const data = await apiRequest("/auth/password/change/", {
        method: "POST",
        token,
        body: {
          current: passwordDraft.current,
          new: passwordDraft.next,
          confirm: passwordDraft.confirm,
        },
      });
      persistAuth(data.token, data.user);
      setPasswordDraft({ current: "", next: "", confirm: "" });
      setPasswordErrors({});
      showToast("Password updated successfully.");
    } catch (error) {
      const payload = error?.data || {};
      const apiErrors = payload.errors || {};
      const mappedErrors = {
        current: apiErrors.current || "",
        next: apiErrors.new || apiErrors.next || apiErrors.password || "",
        confirm: apiErrors.confirm || "",
      };
      Object.keys(mappedErrors).forEach((key) => {
        if (!mappedErrors[key]) {
          delete mappedErrors[key];
        }
      });
      setPasswordErrors(mappedErrors);
      showToast(shortMessageFromError(error), "error");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleEmailSubmit = async () => {
    const nextErrors = {};
    const nextEmail = emailDraft.email.trim();
    if (!nextEmail) {
      nextErrors.email = "Enter a new email.";
    } else if (!emailPattern.test(nextEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!emailDraft.password) {
      nextErrors.password = "Confirm with your password.";
    }
    setEmailErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    if (!token) {
      showToast("Session expired. Please log in again.", "warning");
      return;
    }
    try {
      const data = await apiRequest("/auth/email/", {
        method: "POST",
        token,
        body: { email: nextEmail, password: emailDraft.password },
      });
      persistAuth(token, data.user);
      setChangeEmailOpen(false);
      setEmailDraft({ email: "", password: "" });
      setEmailErrors({});
      setShowEmailPassword(false);
      showToast("Email updated successfully.");
      restoreFocus();
    } catch (error) {
      const payload = error?.data || {};
      setEmailErrors(payload.errors || {});
      showToast(shortMessageFromError(error), "error");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteValue !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }
    if (!token) {
      showToast("Session expired. Please log in again.", "warning");
      navigate("/", { replace: true });
      return;
    }
    try {
      await apiRequest("/auth/delete/", {
        method: "POST",
        token,
        body: { confirm: deleteValue },
      });
      await logout();
      setDeleteAccountOpen(false);
      setDeleteValue("");
      setDeleteError("");
      showToast("Account deleted successfully.");
      navigate("/", { replace: true });
    } catch (error) {
      const payload = error?.data || {};
      const errors = payload.errors || {};
      setDeleteError(errors.confirm || errors.password || shortMessageFromError(error));
    }
  };

  const isPasswordValid = passwordPattern.test(passwordDraft.next);
  const isPasswordMatch =
    passwordDraft.confirm && passwordDraft.confirm === passwordDraft.next;
  const canUpdatePassword =
    Boolean(passwordDraft.current) && isPasswordValid && isPasswordMatch;

  const passwordDisabledMessage = (() => {
    if (passwordSaving) {
      return "Updating password...";
    }
    if (!passwordDraft.current) {
      return "Enter your current password to continue.";
    }
    if (!passwordDraft.next) {
      return "Create a new password to continue.";
    }
    if (!isPasswordValid) {
      return "Use at least 8 characters.";
    }
    if (!passwordDraft.confirm) {
      return "Confirm your new password to continue.";
    }
    if (!isPasswordMatch) {
      return "Passwords do not match.";
    }
    return "";
  })();

  const renderSectionContent = () => {
    if (activeSection === "account") {
      const accountEmail = user?.email || "mikeangelofranco@outlook.com";
      return (
        <div className="settings-section">
          <div className="card settings-card">
            <div className="card-header">
              <h2>Account</h2>
              <p className="muted">Manage your account access and identity.</p>
            </div>
            <div className="account-sections">
              <section className="account-section">
                <div className="account-section-header">
                  <div>
                    <h3>Email</h3>
                    <p className="muted small">{accountEmail}</p>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={(event) => {
                      rememberFocus(event);
                      setEmailDraft({ email: "", password: "" });
                      setEmailErrors({});
                      setShowEmailPassword(false);
                      setChangeEmailOpen(true);
                    }}
                  >
                    Change email
                  </button>
                </div>
              </section>

              <section className="account-section">
                <div className="account-section-title">
                  <h3>Password</h3>
                </div>
                <form
                  className="settings-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (passwordSaving) {
                      return;
                    }
                    handlePasswordSave();
                  }}
                >
                  <div className="settings-grid">
                    <label className="field">
                      <span>Current password</span>
                      <div className="input-row">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordDraft.current}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPasswordDraft((prev) => ({ ...prev, current: value }));
                            if (passwordErrors.current) {
                              setPasswordErrors((prev) => ({ ...prev, current: "" }));
                            }
                          }}
                          placeholder="Enter current password"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setShowCurrentPassword((prev) => !prev)}
                          aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                        >
                          {showCurrentPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      {passwordErrors.current ? (
                        <span className="field-error">{passwordErrors.current}</span>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>New password</span>
                      <div className="input-row">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          value={passwordDraft.next}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPasswordDraft((prev) => ({ ...prev, next: value }));
                            if (passwordErrors.next) {
                              setPasswordErrors((prev) => ({ ...prev, next: "" }));
                            }
                          }}
                          placeholder="Create a new password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          aria-label={showNewPassword ? "Hide password" : "Show password"}
                        >
                          {showNewPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      <span className="helper">Use at least 8 characters.</span>
                      {passwordErrors.next ? (
                        <span className="field-error">{passwordErrors.next}</span>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>Confirm new password</span>
                      <div className="input-row">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordDraft.confirm}
                          onChange={(event) => {
                            const value = event.target.value;
                            setPasswordDraft((prev) => ({ ...prev, confirm: value }));
                            if (passwordErrors.confirm) {
                              setPasswordErrors((prev) => ({ ...prev, confirm: "" }));
                            }
                          }}
                          placeholder="Repeat new password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                      {passwordErrors.confirm ? (
                        <span className="field-error">{passwordErrors.confirm}</span>
                      ) : null}
                    </label>
                  </div>
                  <div className="settings-actions">
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={passwordSaving}
                      aria-disabled={!canUpdatePassword || passwordSaving}
                    >
                      {passwordSaving ? "Updating..." : "Update password"}
                    </button>
                  </div>
                  {!canUpdatePassword && !passwordSaving ? (
                    <span className="helper">{passwordDisabledMessage}</span>
                  ) : null}
                </form>
              </section>

              <section className="account-section">
                <div className="account-section-header">
                  <div>
                    <h3>Sessions</h3>
                    <p className="muted">You're currently signed in on this device.</p>
                    <p className="muted small">Last password change: Coming soon.</p>
                  </div>
                  <div className="account-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(event) => {
                        rememberFocus(event);
                        setLogoutConfirmOpen(true);
                      }}
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </section>

              <section className="account-section danger">
                <div className="account-section-header">
                  <div>
                    <h3>Danger zone</h3>
                    <p className="muted">These actions are permanent and cannot be undone.</p>
                  </div>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={(event) => {
                      rememberFocus(event);
                      setDeleteAccountOpen(true);
                    }}
                  >
                    Delete account
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "profile") {
      return (
        <div className="settings-section">
          <div className="card settings-card">
            <div className="card-header">
              <h2>Profile</h2>
              <p className="muted">Shape how you appear to others.</p>
            </div>
            <div className="settings-stack">
              <div className="settings-subsection">
                <div className="subsection-header">
                  <h3>Identity</h3>
                </div>
                <div className="settings-grid two">
                  <label className="field">
                    <span className="field-label">Display name</span>
                    <input
                      type="text"
                      value={draft.displayName}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                      placeholder="Your name"
                    />
                    {profileErrors.displayName ? (
                      <span className="field-error" role="alert">
                        {profileErrors.displayName}
                      </span>
                    ) : null}
                  </label>
                  <label className="field">
                    <span className="field-label">
                      Username
                      {availability.username === "success" && !profileErrors.username ? (
                        <span
                          className="field-status success"
                          role="status"
                          aria-label="Username available"
                        >
                          &#10003;
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="text"
                      value={draft.username}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) => ({ ...prev, username: value }));
                        if (availability.username !== "neutral") {
                          setAvailability((prev) => ({ ...prev, username: "neutral" }));
                        }
                      }}
                      onBlur={(event) =>
                        void checkAvailability("username", event.target.value)
                      }
                      placeholder="profilehandle"
                    />
                    {profileErrors.username ? (
                      <span className="field-error" role="alert">
                        {profileErrors.username}
                      </span>
                    ) : null}
                    {!profileErrors.username && availability.username === "error" ? (
                      <span className="helper error" role="alert">
                        This username is already taken.
                      </span>
                    ) : null}
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">
                    Profile URL base
                    {availability.profileUrl === "success" && !profileErrors.profileUrl ? (
                        <span
                          className="field-status success"
                          role="status"
                          aria-label="Profile URL available"
                        >
                          &#10003;
                        </span>
                    ) : null}
                  </span>
                  <div className="input-row">
                    <span className="input-prefix">profilespaces.com/</span>
                    <input
                      type="text"
                      value={draft.profileUrl}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDraft((prev) => ({ ...prev, profileUrl: value }));
                        if (availability.profileUrl !== "neutral") {
                          setAvailability((prev) => ({ ...prev, profileUrl: "neutral" }));
                        }
                      }}
                      onBlur={(event) =>
                        void checkAvailability("profileUrl", event.target.value)
                      }
                      placeholder="yourname"
                    />
                  </div>
                  <span className="helper">This is your public profile link.</span>
                  {profileErrors.profileUrl ? (
                    <span className="field-error" role="alert">
                      {profileErrors.profileUrl}
                    </span>
                  ) : null}
                  {!profileErrors.profileUrl && availability.profileUrl === "error" ? (
                    <span className="helper error" role="alert">
                      This URL is not available.
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="settings-subsection">
                <div className="subsection-header">
                  <h3>Presence</h3>
                </div>
                <label className="field">
                  <span className="field-label">Status message</span>
                  <input
                    type="text"
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, status: event.target.value }))
                    }
                    maxLength={80}
                    placeholder="Share a short status"
                  />
                  <span className="helper">
                    A short update that appears at the top of your profile.
                  </span>
                  {profileErrors.status ? (
                    <span className="field-error" role="alert">
                      {profileErrors.status}
                    </span>
                  ) : null}
                </label>
                <label className="field">
                  <span className="field-label">Bio</span>
                  <textarea
                    rows="4"
                    value={draft.bio}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        bio: event.target.value.slice(0, 160),
                      }))
                    }
                    maxLength={160}
                    placeholder="Tell your story in 160 characters."
                  />
                  <span
                    className={`helper ${draft.bio.length >= 140 ? "warning" : ""}`}
                  >
                    {draft.bio.length}/160
                  </span>
                  {profileErrors.bio ? (
                    <span className="field-error" role="alert">
                      {profileErrors.bio}
                    </span>
                  ) : null}
                </label>
                <label className="field">
                  <span className="field-label">Location</span>
                  <input
                    type="text"
                    value={draft.location}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, location: event.target.value }))
                    }
                    placeholder="City, Country"
                  />
                  <span className="helper">Optional. Shown on your profile.</span>
                  {profileErrors.location ? (
                    <span className="field-error" role="alert">
                      {profileErrors.location}
                    </span>
                  ) : null}
                </label>
              </div>

              <div className="settings-subsection">
                <div className="subsection-header">
                  <h3>Interests & Photo</h3>
                </div>
                <div className="field">
                  <span className="field-label">Interests (max 5)</span>
                  <div className="chip-input">
                    <input
                      type="text"
                      value={interestInput}
                      onChange={(event) => setInterestInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddInterest();
                        }
                      }}
                      placeholder="Type and press enter"
                      disabled={draft.interests.length >= 5}
                      aria-disabled={draft.interests.length >= 5}
                    />
                  </div>
                  {draft.interests.length ? (
                    <div className="chip-row">
                      {draft.interests.map((tag) => (
                        <span className="chip" key={tag}>
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveInterest(tag)}
                            aria-label={`Remove ${tag}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {draft.interests.length >= 5 ? (
                    <span className="helper" role="status">
                      Maximum of 5 interests
                    </span>
                  ) : null}
                  {profileErrors.interests ? (
                    <span className="field-error" role="alert">
                      {profileErrors.interests}
                    </span>
                  ) : null}
                </div>
                <div className="field">
                  <span className="field-label">Profile photo</span>
                  <div className="photo-row">
                    <div className="photo-preview">
                      {draft.photoUrl ? (
                        <img src={draft.photoUrl} alt="Profile preview" />
                      ) : (
                        <span>{draft.displayName.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="photo-actions">
                      <label className="btn ghost">
                        {photoUploading ? "Uploading..." : "Upload new photo"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          disabled={photoUploading}
                          hidden
                        />
                      </label>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={handlePhotoRemove}
                        disabled={photoUploading || !draft.photoUrl}
                      >
                        Remove photo
                      </button>
                    </div>
                  </div>
                  <span className="helper">Square images work best.</span>
                </div>
              </div>

              <div className="settings-footer sticky">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSave}
                  disabled={!hasSectionChanges("profile") || isSaving || profileLoading}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleCancel}
                  disabled={!hasSectionChanges("profile") || isSaving || profileLoading}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "privacy") {
      const visibilityHelper =
        draft.visibility === "private"
          ? "Only you can view your profile. Others will see a limited placeholder."
          : "Anyone with your link can view your profile.";
      const hasLocation = Boolean(saved.location);
      const locationHelper = hasLocation
        ? "Only shown when you've added a location to your profile."
        : "Add a location in your profile to enable this setting.";
      return (
        <div className="settings-section">
          <div className="card settings-card">
            <div className="card-header">
              <h2>Privacy</h2>
              <p className="muted">
                Choose who can see your profile and how it appears in search.
              </p>
            </div>
            <div className="settings-stack">
              <div className="privacy-row">
                <div className="privacy-meta">
                  <p className="label">Profile visibility</p>
                  <p className="muted">{visibilityHelper}</p>
                </div>
                <div className="privacy-control">
                  <select
                    value={draft.visibility}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, visibility: event.target.value }))
                    }
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>

              <div className={`privacy-row ${hasLocation ? "" : "disabled"}`}>
                <div className="privacy-meta">
                  <p className="label">Show location</p>
                  <p className="muted">{locationHelper}</p>
                </div>
                <div className="privacy-control">
                  <label className="switch-row" aria-disabled={!hasLocation}>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={hasLocation && draft.showLocation}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, showLocation: event.target.checked }))
                        }
                        disabled={!hasLocation}
                        aria-disabled={!hasLocation}
                      />
                      <span />
                    </span>
                    <span className="switch-text">
                      {draft.showLocation && hasLocation ? "On" : "Off"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="privacy-row">
                <div className="privacy-meta">
                  <p className="label">Allow search engines</p>
                  <p className="muted">
                    When off, your profile won't appear in search engine results.
                  </p>
                  <p className="muted small">Changes may take time to reflect on external sites.</p>
                </div>
                <div className="privacy-control">
                  <label className="switch-row">
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={draft.allowSearch}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, allowSearch: event.target.checked }))
                        }
                      />
                      <span />
                    </span>
                    <span className="switch-text">{draft.allowSearch ? "On" : "Off"}</span>
                  </label>
                </div>
              </div>

              <div className="settings-footer sticky">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSave}
                  disabled={!hasSectionChanges("privacy") || isSaving}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleCancel}
                  disabled={!hasSectionChanges("privacy") || isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "notifications") {
      const notificationsPaused = draft.pauseNotifications !== "off";
      const pauseStatus =
        draft.pauseNotifications === "day"
          ? "Paused for 1 day"
          : draft.pauseNotifications === "week"
            ? "Paused for 1 week"
            : "";
      const disableNotificationToggles = notificationsPaused || isSaving;
      return (
        <div className="settings-section">
          <div className="card settings-card">
            <div className="card-header">
              <h2>Notifications</h2>
              <p className="muted">Keep alerts calm and intentional.</p>
            </div>
            <div className="settings-stack">
              <div className="toggle-row notification-row pause-row">
                <div className="notification-meta">
                  <div className="notification-heading">
                    <p className="label">Pause all notifications</p>
                    {notificationsPaused ? (
                      <span className="status-pill small">{pauseStatus}</span>
                    ) : null}
                  </div>
                  <p className="muted">Temporarily silence all notifications.</p>
                  {notificationsPaused ? (
                    <p className="muted small">
                      Individual alerts resume when the pause ends.
                    </p>
                  ) : null}
                </div>
                <div className="notification-control">
                  <select
                    value={draft.pauseNotifications}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, pauseNotifications: event.target.value }))
                    }
                    disabled={isSaving}
                  >
                    <option value="off">Off</option>
                    <option value="day">Pause for 1 day</option>
                    <option value="week">Pause for 1 week</option>
                  </select>
                </div>
              </div>

              <div className="settings-subsection">
                <div className="subsection-header">
                  <h3>Account notifications</h3>
                  <p className="muted">Important updates related to your account.</p>
                </div>
                <div
                  className={`toggle-row notification-row${
                    disableNotificationToggles ? " disabled" : ""
                  }`}
                >
                  <div className="notification-meta">
                    <p className="label">Email notifications</p>
                    <p className="muted">Security and essential account updates.</p>
                  </div>
                  <label
                    className="switch-row"
                    aria-disabled={disableNotificationToggles}
                  >
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={draft.emailNotifications}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            emailNotifications: event.target.checked,
                          }))
                        }
                        disabled={disableNotificationToggles}
                      />
                      <span />
                    </span>
                    <span className="switch-text">
                      {draft.emailNotifications ? "On" : "Off"}
                    </span>
                  </label>
                </div>
                <div
                  className={`toggle-row notification-row${
                    disableNotificationToggles ? " disabled" : ""
                  }`}
                >
                  <div className="notification-meta">
                    <p className="label">Product updates</p>
                    <p className="muted">Occasional updates about improvements.</p>
                  </div>
                  <label
                    className="switch-row"
                    aria-disabled={disableNotificationToggles}
                  >
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={draft.productUpdates}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            productUpdates: event.target.checked,
                          }))
                        }
                        disabled={disableNotificationToggles}
                      />
                      <span />
                    </span>
                    <span className="switch-text">
                      {draft.productUpdates ? "On" : "Off"}
                    </span>
                  </label>
                </div>
              </div>

              <div className="settings-subsection">
                <div className="subsection-header">
                  <h3>Social notifications</h3>
                  <p className="muted">Alerts related to activity on your profile.</p>
                </div>
                <div className="toggle-row notification-row">
                  <div className="notification-meta">
                    <p className="label">New follower alerts</p>
                    <p className="muted">Get notified when someone follows you.</p>
                    <p className="muted small">You can switch this on or off now.</p>
                  </div>
                  <label className="switch-row">
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={draft.newFollowerAlerts}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, newFollowerAlerts: event.target.checked }))
                        }
                        disabled={disableNotificationToggles}
                      />
                      <span />
                    </span>
                    <span className="switch-text">
                      {draft.newFollowerAlerts ? "On" : "Off"}
                    </span>
                  </label>
                </div>
                <div className="toggle-row notification-row">
                  <div className="notification-meta">
                    <p className="label">Weekly digest</p>
                    <p className="muted">A short summary of activity on your profile.</p>
                    <p className="muted small">You can switch this on or off now.</p>
                  </div>
                  <label className="switch-row">
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={draft.weeklyDigest}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, weeklyDigest: event.target.checked }))
                        }
                        disabled={disableNotificationToggles}
                      />
                      <span />
                    </span>
                    <span className="switch-text">
                      {draft.weeklyDigest ? "On" : "Off"}
                    </span>
                  </label>
                </div>
              </div>
              <div className="settings-footer">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSave}
                  disabled={!hasSectionChanges("notifications") || isSaving}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleCancel}
                  disabled={!hasSectionChanges("notifications") || isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeSection === "appearance") {
      return (
        <div className="settings-section">
          <div className="card settings-card">
            <div className="card-header">
              <h2>Appearance</h2>
              <p className="muted">Tune the mood and motion.</p>
            </div>
            <div className="settings-stack">
              <div className="toggle-row">
                <div>
                  <p className="label">Theme</p>
                  <p className="muted">Pick a display preference.</p>
                </div>
                <select
                  value={draft.theme}
                  onChange={(event) => setDraft((prev) => ({ ...prev, theme: event.target.value }))}
                >
                  <option value="system">System</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div className="settings-footer">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleSave}
                  disabled={!hasSectionChanges("appearance") || isSaving}
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleCancel}
                  disabled={!hasSectionChanges("appearance") || isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-section">
        <div className="card settings-card">
          <div className="card-header">
            <h2>Help</h2>
            <p className="muted">Guides and support.</p>
          </div>
          <div className="settings-stack">
            <div className="settings-row">
              <div>
                <p className="label">Contact support</p>
                <p className="muted">support@plughub-ims.com</p>
              </div>
              <a className="btn ghost" href="mailto:support@plughub-ims.com">
                Email
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="settings-skeleton">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
    </div>
  );

  if (!user && isRestoring) {
    return (
      <div className="app settings-app">
        <main className="settings-main">{renderSkeleton()}</main>
      </div>
    );
  }

  return (
    <div className="app settings-app">
      <header className="settings-topbar">
        <button
          type="button"
          className="icon-button"
          onClick={(event) => {
            if (hasSectionChanges(activeSection)) {
              rememberFocus(event);
              setPendingSection("back");
              setDiscardOpen(true);
              return;
            }
            navigate("/profile");
          }}
          aria-label="Back to profile"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 6l-6 6 6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="top-title">Settings</span>
        <span />
      </header>

      <main className="settings-main">
        <div className="settings-layout">
          {!isMobile ? (
            <aside className="settings-nav">
              <h2>Settings</h2>
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`nav-item ${activeSection === section.id ? "active" : ""}`}
                  onClick={() => handleSectionChange(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </aside>
          ) : null}

          <section className="settings-content">
            {isMobile ? (
              <div className="settings-mobile">
                {isLoading ? (
                  renderSkeleton()
                ) : (
                  <>
                    {showMobileList ? (
                      <div className="settings-card-grid">
                        {settingsSections.map((section) => (
                          <button
                            key={section.id}
                            type="button"
                            className="card settings-tile"
                            onClick={() => handleSectionChange(section.id)}
                          >
                            <h3>{section.label}</h3>
                            <p className="muted">Manage {section.label.toLowerCase()}.</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="settings-back">
                          <button type="button" className="text-button" onClick={handleBackToList}>
                            Back
                          </button>
                        </div>
                        {renderSectionContent()}
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>{isLoading ? renderSkeleton() : renderSectionContent()}</>
            )}
          </section>
        </div>
      </main>

      <div
        className={`toast ${toastMessage ? "show" : ""} ${toastType}`}
        role="status"
        aria-live="polite"
      >
        {toastMessage}
      </div>

      <ConfirmDialog
        isOpen={discardOpen}
        title="Discard changes?"
        body={
          activeSection === "privacy"
            ? "Your privacy changes haven't been saved."
            : "You have unsaved changes. Do you want to discard them?"
        }
        confirmLabel="Discard"
        cancelLabel={activeSection === "privacy" ? "Continue editing" : "Cancel"}
        onConfirm={() => {
          setDraft(saved);
          setProfileErrors({});
          setInterestInput("");
          setAvailability({ username: "neutral", profileUrl: "neutral" });
          setDiscardOpen(false);
          if (pendingSection === "back") {
            navigate("/profile");
            setPendingSection(null);
            return;
          }
          if (pendingSection === "list") {
            setShowMobileList(true);
            setSearchParams({}, { replace: true });
            setPendingSection(null);
            return;
          }
          if (pendingSection) {
            applySection(pendingSection);
          }
          setPendingSection(null);
        }}
        onCancel={handleDiscardCancel}
        danger
      />
      <ConfirmDialog
        isOpen={logoutConfirmOpen}
        title="Log out?"
        body="You'll be signed out on this device."
        confirmLabel="Log out"
        cancelLabel="Cancel"
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          handleLogout();
        }}
        onCancel={() => {
          setLogoutConfirmOpen(false);
          restoreFocus();
        }}
      />
      <Modal
        isOpen={changeEmailOpen}
        title="Change email"
        onClose={() => {
          setChangeEmailOpen(false);
          setEmailErrors({});
          setEmailDraft({ email: "", password: "" });
          setShowEmailPassword(false);
          restoreFocus();
        }}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setChangeEmailOpen(false);
                setEmailErrors({});
                setEmailDraft({ email: "", password: "" });
                setShowEmailPassword(false);
                restoreFocus();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn primary" form="change-email-form">
              Change email
            </button>
          </>
        }
      >
        <form
          id="change-email-form"
          className="settings-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            handleEmailSubmit();
          }}
        >
          <label className="field">
            <span>New email</span>
            <input
              type="email"
              name="new-email"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              inputMode="email"
              data-lpignore="true"
              data-1p-ignore="true"
              value={emailDraft.email}
              onChange={(event) => {
                const value = event.target.value;
                setEmailDraft((prev) => ({ ...prev, email: value }));
                if (emailErrors.email) {
                  setEmailErrors((prev) => ({ ...prev, email: "" }));
                }
              }}
              placeholder="you@profilespaces.com"
            />
            {emailErrors.email ? (
              <span className="field-error">{emailErrors.email}</span>
            ) : null}
          </label>
          <label className="field">
            <span>Password confirmation</span>
            <div className="input-row">
              <input
                type={showEmailPassword ? "text" : "password"}
                name="confirm-email-password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={emailDraft.password}
                onChange={(event) => {
                  const value = event.target.value;
                  setEmailDraft((prev) => ({ ...prev, password: value }));
                  if (emailErrors.password) {
                    setEmailErrors((prev) => ({ ...prev, password: "" }));
                  }
                }}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="text-button"
                onClick={() => setShowEmailPassword((prev) => !prev)}
                aria-label={showEmailPassword ? "Hide password" : "Show password"}
              >
                {showEmailPassword ? "Hide" : "Show"}
              </button>
            </div>
            {emailErrors.password ? (
              <span className="field-error">{emailErrors.password}</span>
            ) : null}
          </label>
        </form>
      </Modal>
      <Modal
        isOpen={deleteAccountOpen}
        title="Delete account"
        onClose={() => {
          setDeleteAccountOpen(false);
          setDeleteError("");
          setDeleteValue("");
          restoreFocus();
        }}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setDeleteAccountOpen(false);
                setDeleteError("");
                setDeleteValue("");
                restoreFocus();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={handleDeleteAccount}
              disabled={deleteValue !== "DELETE"}
            >
              Delete account
            </button>
          </>
        }
      >
        <p className="muted">Type DELETE to confirm account deletion.</p>
        <label className="field">
          <span>Confirmation</span>
          <input
            type="text"
            value={deleteValue}
            onChange={(event) => {
              setDeleteValue(event.target.value);
              setDeleteError("");
            }}
            placeholder="DELETE"
          />
          {deleteValue !== "DELETE" ? (
            <span className="helper">Type DELETE to enable the button.</span>
          ) : null}
          {deleteError ? <span className="field-error">{deleteError}</span> : null}
        </label>
      </Modal>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
