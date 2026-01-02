import { useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

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

const profile = {
  displayName: "Mika Franco",
  username: "mikefranco",
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
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "updates", label: "Updates" },
  { id: "links", label: "Links" },
];

function LoginForm({ onSwitchToSignup }) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
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
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!values.identifier.trim()) {
      nextErrors.identifier = "Enter your email or username.";
    }
    if (!values.password.trim()) {
      nextErrors.password = "Password is required.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 900);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h3>Welcome back</h3>
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
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
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!values.name.trim()) {
      nextErrors.name = "Name is required.";
    }
    if (!values.username.trim()) {
      nextErrors.username = "Choose a username.";
    }
    if (!values.email.trim()) {
      nextErrors.email = "Email is required.";
    }
    if (!values.password.trim()) {
      nextErrors.password = "Create a password.";
    }
    if (values.password !== values.confirm) {
      nextErrors.confirm = "Passwords do not match.";
    }
    if (!values.agree) {
      nextErrors.agree = "Agree to Terms & Privacy.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 900);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h3>Create account</h3>
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const year = useMemo(() => new Date().getFullYear(), []);

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
          <Link to="/profile" className="ghost show-desktop">
            Profile
          </Link>
          <button
            type="button"
            className="ghost show-desktop"
            onClick={() => openSheet("login")}
          >
            Log in
          </button>
          <button
            type="button"
            className="accent show-desktop"
            onClick={() => openSheet("signup")}
          >
            Create account
          </button>
          <Link to="/profile" className="text-button show-mobile profile-link">
            Profile
          </Link>
          <button
            type="button"
            className="accent show-mobile"
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
              <button
                type="button"
                className="text-button"
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
  const [activeTab, setActiveTab] = useState("overview");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const isLoading = false;
  const isOwner = true;
  const profileUrl = `profilespaces.com/${profile.username}`;
  const displayBio =
    profile.bio.length > 160 ? profile.bio.slice(0, 160) : profile.bio;
  const interests = profile.interests.slice(0, 5);
  const initials = profile.displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const showToast = (message) => {
    setToast(message);
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(profileUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = profileUrl;
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
      showToast("Unable to copy link");
    }
  };

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
        <button type="button" className="icon-button" aria-label="Profile menu">
          <span aria-hidden="true">...</span>
        </button>
      </header>

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
              ) : (
                <>
                  <div className="avatar-wrap">
                    <div className="avatar" role="img" aria-label="Profile photo">
                      {initials}
                    </div>
                  </div>
                  <div className="identity-text">
                    <h1>{profile.displayName}</h1>
                    <p className="username">@{profile.username}</p>
                  </div>
                  <div className="url-row">
                    <span className="url-text">{profileUrl}</span>
                    <button type="button" className="btn ghost" onClick={handleCopy}>
                      Copy
                    </button>
                  </div>
                  <div className="status-pill">{profile.status}</div>
                  <p className="bio">{displayBio}</p>
                  <div className="meta-row">
                    {profile.location ? (
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
                        <span>{profile.location}</span>
                      </div>
                    ) : null}
                    <div className="tag-row">
                      {interests.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isOwner ? (
                    <div className="action-row desktop-actions">
                      <button type="button" className="btn primary">
                        Edit profile
                      </button>
                      <button type="button" className="btn ghost" onClick={handleCopy}>
                        Share profile
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </aside>

          <section className="content-column">
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
                    <div className="status-pill">{profile.status}</div>
                    <p className="bio">{displayBio}</p>
                    {profile.location ? (
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
                        <span>{profile.location}</span>
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
          </section>
        </div>

        {isOwner ? (
          <div className="action-row mobile-actions">
            <button type="button" className="btn primary">
              Edit profile
            </button>
            <button type="button" className="btn ghost" onClick={handleCopy}>
              Share profile
            </button>
          </div>
        ) : null}
      </main>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
