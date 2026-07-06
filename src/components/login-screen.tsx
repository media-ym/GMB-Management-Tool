"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Mail, Lock, Eye, EyeOff, Loader2, Star, PenTool, Target, Sparkles, User, Phone, MapPin, Shield, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const GREENS = {
  primary: "#72D44C",
  primaryDark: "#4FAE25",
  light: "#F5FFF1",
  text: "#202124",
  gray: "#6B7280",
  border: "#E7E7E7",
  buttonGrad: "linear-gradient(135deg, #8BE04E 0%, #5DBE2E 100%)",
  bgGrad: "linear-gradient(135deg, #f8fff2 0%, #e8ffd4 30%, #d8ffb5 60%, #bdfc89 100%)",
};

const FEATURES = [
  { icon: Star, label: "Review Management" },
  { icon: PenTool, label: "Google Posts" },
  { icon: Target, label: "Local SEO Tracking" },
  { icon: Sparkles, label: "MiSA AI Assistant" },
];

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "admin@myfng.in", color: "#72D44C" },
  { role: "Marketing Manager", email: "marketing@myfng.in", color: "#5DBE2E" },
  { role: "Branch Manager", email: "thane@myfng.in", color: "#4FAE25" },
  { role: "Customer Support", email: "support@myfng.in", color: "#8BE04E" },
  { role: "Viewer", email: "viewer@myfng.in", color: "#A0A0A0" },
];

export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("admin@myfng.in");
  const [password, setPassword] = useState("MyFNG@2025");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  // Register form
  const [regForm, setRegForm] = useState({ name: "", email: "", mobile: "", branch: "", role: "viewer", password: "", confirm: "", agree: false });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) { toast.error("Invalid credentials."); return; }
    toast.success("Welcome to MyFNG Local AI Manager");
    router.refresh();
  }

  async function quickLogin(acc: string) {
    setEmail(acc);
    setPassword("MyFNG@2025");
    setLoading(true);
    const res = await signIn("credentials", { email: acc, password: "MyFNG@2025", redirect: false });
    setLoading(false);
    if (res?.error) { toast.error("Login failed"); return; }
    toast.success("Signed in");
    router.refresh();
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!regForm.name || !regForm.email || !regForm.password) { toast.error("Please fill all required fields"); return; }
    if (regForm.password !== regForm.confirm) { toast.error("Passwords do not match"); return; }
    if (!regForm.agree) { toast.error("Please agree to Terms"); return; }
    toast.info("Account creation requires admin approval. Contact your Super Admin.");
  }

  return (
    <div className="min-h-screen flex" style={{ background: GREENS.bgGrad }}>
      {/* ═══ LEFT SECTION — 40% Illustration ═════════════════════════════ */}
      <div className="hidden lg:flex lg:w-2/5 flex-col justify-between p-12 relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex-1 flex flex-col justify-center"
        >
          {/* 3D Illustration — Mechanic repairing a car */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative mb-10"
          >
            {/* Scene container */}
            <div className="relative w-full max-w-md mx-auto" style={{ height: "300px" }}>

              {/* Wall clock */}
              <div className="absolute top-0 right-4 size-14 rounded-full bg-white shadow-md flex items-center justify-center border-2 border-gray-100 z-10">
                <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-gray-700 origin-bottom" style={{ transform: "translate(-50%, -100%) rotate(30deg)" }} />
                <div className="absolute top-1/2 left-1/2 w-0.5 h-3 bg-gray-700 origin-bottom" style={{ transform: "translate(-50%, -100%) rotate(150deg)" }} />
                <div className="size-1.5 rounded-full bg-gray-700 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>

              {/* Plant right */}
              <div className="absolute bottom-2 right-0 w-16 h-24">
                <div className="absolute bottom-0 left-3 w-10 h-12 rounded-t-lg bg-white shadow-sm" />
                <motion.div animate={{ rotate: [0, 4, 0] }} transition={{ duration: 3, repeat: Infinity }} className="absolute bottom-10 left-1 w-6 h-16 rounded-full" style={{ background: "#4FAE25", borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%" }} />
                <motion.div animate={{ rotate: [0, -4, 0] }} transition={{ duration: 3.5, repeat: Infinity }} className="absolute bottom-12 left-5 w-5 h-12 rounded-full" style={{ background: "#72D44C", borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%" }} />
              </div>

              {/* ═══ CAR ═══════════════════════════════════════════════════ */}
              {/* Car body */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-72 h-20 z-20">
                {/* Car roof/cabin */}
                <div className="absolute top-0 left-12 w-48 h-14 rounded-t-[28px] shadow-lg" style={{ background: "#E53935" }} />
                {/* Windshield */}
                <div className="absolute top-1.5 left-16 w-20 h-10 rounded-t-2xl" style={{ background: "rgba(100,200,255,0.7)" }} />
                <div className="absolute top-1.5 right-16 w-20 h-10 rounded-t-2xl" style={{ background: "rgba(100,200,255,0.7)" }} />
                {/* Roof line */}
                <div className="absolute top-0 left-12 w-48 h-2 rounded-t-[28px]" style={{ background: "#C62828" }} />

                {/* Car main body */}
                <div className="absolute top-12 left-0 w-full h-12 rounded-[12px] shadow-xl" style={{ background: "#E53935" }} />
                {/* Side stripe */}
                <div className="absolute top-16 left-2 w-[calc(100%-16px)] h-1.5 rounded-full" style={{ background: "#C62828" }} />

                {/* Door line */}
                <div className="absolute top-12 left-1/2 w-0.5 h-12" style={{ background: "#C62828" }} />

                {/* Door handle */}
                <div className="absolute top-15 left-[42%] w-5 h-1 rounded-full bg-gray-400/50" />

                {/* Headlight */}
                <div className="absolute top-15 right-1 w-4 h-4 rounded-full" style={{ background: "#FFF59D", boxShadow: "0 0 8px #FFF59D" }} />
                {/* Taillight */}
                <div className="absolute top-15 left-1 w-3 h-4 rounded-l-full" style={{ background: "#B71C1C" }} />

                {/* ═══ CAR HOOD OPEN (repair scene) ════════════════════════ */}
                {/* Hood propped open */}
                <div className="absolute -top-8 left-0 w-24 h-3 rounded-t-lg shadow-md origin-bottom transform rotate-[-25deg]" style={{ background: "#D32F2F" }}>
                  {/* Hood support rod */}
                  <div className="absolute top-3 right-0 w-0.5 h-8 bg-gray-400 origin-top transform rotate-[25deg]" />
                </div>

                {/* Engine bay (dark area under hood) */}
                <div className="absolute top-10 left-0 w-24 h-6 rounded-t-md" style={{ background: "#1a1a1a" }}>
                  {/* Engine block */}
                  <div className="absolute top-1 left-3 w-8 h-4 rounded" style={{ background: "#555" }} />
                  <div className="absolute top-1.5 left-4 w-6 h-3 rounded" style={{ background: "#666" }} />
                  {/* Spark plug wires */}
                  <div className="absolute top-0 left-6 w-0.5 h-2" style={{ background: "#FF6F00" }} />
                  <div className="absolute top-0 left-9 w-0.5 h-2" style={{ background: "#2196F3" }} />
                  <div className="absolute top-0 left-12 w-0.5 h-2" style={{ background: "#4CAF50" }} />
                  {/* Dipstick */}
                  <div className="absolute top-1 right-2 w-0.5 h-3 rounded-full bg-yellow-600" />
                </div>
              </div>

              {/* ═══ CAR WHEELS ════════════════════════════════════════════ */}
              {/* Front wheel (right) */}
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-4 right-[20%] z-30"
              >
                <div className="size-12 rounded-full border-4 border-gray-800 bg-gray-900 flex items-center justify-center shadow-lg">
                  <div className="size-6 rounded-full bg-gray-500 flex items-center justify-center">
                    {/* Spokes */}
                    {[0, 60, 120, 180, 240, 300].map((deg) => (
                      <div key={deg} className="absolute w-0.5 h-4 bg-gray-400 origin-center" style={{ transform: `rotate(${deg}deg) translateY(-4px)` }} />
                    ))}
                    <div className="size-2 rounded-full bg-gray-600" />
                  </div>
                </div>
              </motion.div>

              {/* Rear wheel (left) */}
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute bottom-4 left-[18%] z-30"
              >
                <div className="size-12 rounded-full border-4 border-gray-800 bg-gray-900 flex items-center justify-center shadow-lg">
                  <div className="size-6 rounded-full bg-gray-500 flex items-center justify-center">
                    {[0, 60, 120, 180, 240, 300].map((deg) => (
                      <div key={deg} className="absolute w-0.5 h-4 bg-gray-400 origin-center" style={{ transform: `rotate(${deg}deg) translateY(-4px)` }} />
                    ))}
                    <div className="size-2 rounded-full bg-gray-600" />
                  </div>
                </div>
              </motion.div>

              {/* ═══ MECHANIC CHARACTER ════════════════════════════════════ */}
              <div className="absolute bottom-4 left-4 w-16 h-32 z-30">
                {/* Head */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 size-10 rounded-full" style={{ background: "#E8C39E" }}>
                  {/* Hair */}
                  <div className="absolute -top-0.5 left-0 w-full h-4 rounded-t-full" style={{ background: "#3E2723" }} />
                  {/* Cap beak */}
                  <div className="absolute top-2 -right-3 w-5 h-2.5 rounded-r-full" style={{ background: "#4FAE25" }} />
                  {/* Cap body */}
                  <div className="absolute -top-1 left-1 w-8 h-3 rounded-t-full" style={{ background: "#4FAE25" }} />
                  {/* Eyes */}
                  <div className="absolute bottom-3 left-2 size-1.5 rounded-full bg-gray-800" />
                  <div className="absolute bottom-3 right-2 size-1.5 rounded-full bg-gray-800" />
                  {/* Smile */}
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 rounded-b-full border-b-2 border-gray-700" />
                </div>

                {/* Neck */}
                <div className="absolute top-9 left-1/2 -translate-x-1/2 w-3 h-2" style={{ background: "#E8C39E" }} />

                {/* Body — green overalls/work shirt */}
                <div className="absolute top-10 left-1/2 -translate-x-1/2 w-14 h-14 rounded-t-xl" style={{ background: GREENS.primary }}>
                  {/* Overall straps */}
                  <div className="absolute top-0 left-2 w-2 h-5 rounded-full" style={{ background: "#4FAE25" }} />
                  <div className="absolute top-0 right-2 w-2 h-5 rounded-full" style={{ background: "#4FAE25" }} />
                  {/* Name badge */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 w-6 h-2 rounded bg-white/60" />
                  {/* Center seam */}
                  <div className="absolute top-5 left-1/2 -translate-x-1/2 w-0.5 h-9" style={{ background: "#4FAE25" }} />
                </div>

                {/* Left arm reaching toward engine */}
                <div className="absolute top-11 left-0 w-4 h-10 origin-top transform rotate-[30deg]">
                  <div className="w-full h-full rounded-full" style={{ background: GREENS.primary }} />
                  {/* Hand */}
                  <div className="absolute bottom-0 left-0 size-3.5 rounded-full" style={{ background: "#E8C39E" }} />
                </div>

                {/* Right arm holding wrench */}
                <div className="absolute top-12 right-0 w-3.5 h-9 origin-top transform rotate-[-15deg]">
                  <div className="w-full h-full rounded-full" style={{ background: GREENS.primary }} />
                  {/* Hand holding wrench */}
                  <div className="absolute bottom-0 left-0 size-3 rounded-full" style={{ background: "#E8C39E" }} />
                  {/* Wrench */}
                  <div className="absolute bottom-0 left-1 w-1.5 h-7 origin-bottom transform rotate-[-45deg] rounded-sm bg-gray-500 shadow-sm">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-2.5 rounded border-2 border-gray-600 bg-gray-400" />
                  </div>
                </div>

                {/* Legs — dark pants */}
                <div className="absolute top-22 left-1/2 -translate-x-1/2 flex gap-1">
                  <div className="w-4 h-8 rounded-b-md" style={{ background: "#37474F" }} />
                  <div className="w-4 h-8 rounded-b-md" style={{ background: "#37474F" }} />
                </div>

                {/* Boots */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1">
                  <div className="w-5 h-3 rounded-md rounded-bl-none" style={{ background: "#263238" }} />
                  <div className="w-5 h-3 rounded-md rounded-br-none" style={{ background: "#263238" }} />
                </div>
              </div>

              {/* ═══ TOOLBOX ════════════════════════════════════════════════ */}
              <div className="absolute bottom-4 right-4 w-14 h-10 z-25">
                <div className="absolute bottom-0 w-full h-8 rounded-lg shadow-md" style={{ background: "#37474F" }}>
                  {/* Tray */}
                  <div className="absolute top-0 left-0 w-full h-2 rounded-t-lg bg-gray-600" />
                  {/* Tool slots */}
                  <div className="absolute top-2.5 left-1.5 w-1.5 h-5 rounded-full" style={{ background: "#FF6F00" }} />
                  <div className="absolute top-2.5 left-4 w-1.5 h-5 rounded-full" style={{ background: "#2196F3" }} />
                  <div className="absolute top-2.5 left-7 w-1.5 h-5 rounded-full bg-gray-400" />
                  <div className="absolute top-2.5 left-10 w-1.5 h-5 rounded-full bg-gray-500" />
                </div>
                {/* Handle */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-2 rounded-full border-2 border-gray-600" />
              </div>

              {/* ═══ OIL DRAIN PAN ══════════════════════════════════════════ */}
              <div className="absolute bottom-2 left-[42%] w-12 h-3 z-25">
                <div className="w-full h-full rounded-full" style={{ background: "#212121" }}>
                  <div className="absolute top-0 left-0 w-full h-1 rounded-full" style={{ background: "#424242" }} />
                </div>
              </div>

              {/* ═══ FLOOR SHADOW ═══════════════════════════════════════════ */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-80 h-4 rounded-full bg-black/8 blur-md" />

              {/* ═══ SPARK / SPARKLE near engine ════════════════════════════ */}
              <motion.div
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                className="absolute top-[42%] left-[32%] z-35"
              >
                <Sparkles className="size-4 text-yellow-400" />
              </motion.div>
            </div>
          </motion.div>

          {/* Content */}
          <div className="max-w-md">
            <h1 className="text-3xl font-bold leading-tight mb-3" style={{ color: GREENS.text }}>
              One Dashboard for Every<br />MyFNG Google Business Profile.
            </h1>
            <p className="text-base mb-8 leading-relaxed" style={{ color: GREENS.gray }}>
              Centralize reviews, posts, local SEO, and<br />analytics across all MyFNG locations.
            </p>

            {/* Feature list — 2x2 grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  whileHover={{ y: -4, boxShadow: "0 8px 20px rgba(0,0,0,0.06)" }}
                  className="flex items-center gap-2.5 bg-white/60 backdrop-blur rounded-xl px-3 py-2.5 cursor-default"
                >
                  <div className="size-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GREENS.primary}20` }}>
                    <f.icon className="size-3.5" style={{ color: GREENS.primaryDark }} />
                  </div>
                  <span className="text-xs font-medium" style={{ color: GREENS.text }}>{f.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="text-xs" style={{ color: GREENS.gray, opacity: 0.6 }}>
          Internal Enterprise Platform · Authorized MyFNG personnel only · v1.0
        </div>
      </div>

      {/* ═══ RIGHT SECTION — 60% Auth Card ═══════════════════════════════ */}
      <div className="w-full lg:w-3/5 flex items-center justify-center p-6 sm:p-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[520px] bg-white p-8 sm:p-12"
          style={{ borderRadius: "32px", boxShadow: "0 25px 60px rgba(0,0,0,0.08)" }}
        >
          {/* Logo */}
          <div className="flex items-center justify-center gap-2.5 mb-7">
            <div className="size-11 rounded-xl flex items-center justify-center" style={{ background: GREENS.buttonGrad }}>
              <Building2 className="size-6 text-white" />
            </div>
            <span className="font-bold text-xl" style={{ color: GREENS.text }}>MyFNG</span>
          </div>

          <AnimatePresence mode="wait">
            {mode === "login" ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Heading */}
                <div className="text-center mb-10">
                  <h2 className="text-4xl font-bold mb-2" style={{ color: GREENS.text }}>Welcome Back</h2>
                  <p className="text-base" style={{ color: GREENS.gray }}>Sign in to continue managing all MyFNG branches.</p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 size-5 z-10" style={{ color: GREENS.gray }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      required
                      className="w-full h-[58px] rounded-[18px] border pl-14 pr-5 text-base outline-none transition-all"
                      style={{ borderColor: GREENS.border, color: GREENS.text }}
                      onFocus={(e) => { e.target.style.borderColor = GREENS.primary; e.target.style.boxShadow = `0 0 0 3px ${GREENS.primary}25`; }}
                      onBlur={(e) => { e.target.style.borderColor = GREENS.border; e.target.style.boxShadow = "none"; }}
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 size-5 z-10" style={{ color: GREENS.gray }} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      className="w-full h-[58px] rounded-[18px] border pl-14 pr-14 text-base outline-none transition-all"
                      style={{ borderColor: GREENS.border, color: GREENS.text }}
                      onFocus={(e) => { e.target.style.borderColor = GREENS.primary; e.target.style.boxShadow = `0 0 0 3px ${GREENS.primary}25`; }}
                      onBlur={(e) => { e.target.style.borderColor = GREENS.border; e.target.style.boxShadow = "none"; }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-5 top-1/2 -translate-y-1/2" style={{ color: GREENS.gray }}>
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>

                  {/* Remember + Forgot */}
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer" style={{ color: GREENS.gray }}>
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded accent-[#72D44C]" />
                      Remember me
                    </label>
                    <a href="#" className="font-medium hover:underline" style={{ color: GREENS.primaryDark }}>Forgot password?</a>
                  </div>

                  {/* Login button */}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: 1.02, boxShadow: `0 10px 30px ${GREENS.primary}40` }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-[58px] rounded-[18px] text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer border-0"
                    style={{ background: GREENS.buttonGrad }}
                  >
                    {loading ? <Loader2 className="size-5 animate-spin" /> : <>Sign In <ArrowRight className="size-5" /></>}
                  </motion.button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4 my-7">
                  <div className="flex-1 h-px" style={{ background: GREENS.border }} />
                  <span className="text-xs" style={{ color: GREENS.gray }}>OR</span>
                  <div className="flex-1 h-px" style={{ background: GREENS.border }} />
                </div>

                {/* Quick Demo Login */}
                <div className="mb-5">
                  <p className="text-xs text-center mb-3" style={{ color: GREENS.gray }}>Quick Demo Login</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <motion.button
                        key={acc.email}
                        onClick={() => quickLogin(acc.email)}
                        disabled={loading}
                        whileHover={{ y: -3, borderColor: GREENS.primary }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-xl border bg-white px-3 py-2.5 text-left transition-all disabled:opacity-50"
                        style={{ borderColor: GREENS.border }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full shrink-0" style={{ background: acc.color }} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate" style={{ color: GREENS.text }}>{acc.role}</div>
                            <div className="text-[10px] truncate" style={{ color: GREENS.gray }}>{acc.email}</div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <p className="text-center text-[11px] mt-3" style={{ color: GREENS.gray }}>
                    All demo accounts use password <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: GREENS.light }}>MyFNG@2025</code>
                  </p>
                </div>

                {/* Register link */}
                <div className="text-center text-sm" style={{ color: GREENS.gray }}>
                  Don't have an account?{" "}
                  <button onClick={() => setMode("register")} className="font-semibold hover:underline" style={{ color: GREENS.primaryDark }}>
                    Create Account
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Heading */}
                <div className="text-center mb-8">
                  <h2 className="text-4xl font-bold mb-2" style={{ color: GREENS.text }}>Create Account</h2>
                  <p className="text-base" style={{ color: GREENS.gray }}>Create your enterprise access.</p>
                </div>

                {/* Register Form */}
                <form onSubmit={handleRegister} className="space-y-3.5">
                  <InputField icon={User} placeholder="Full Name" value={regForm.name} onChange={(v) => setRegForm({ ...regForm, name: v })} />
                  <InputField icon={Mail} placeholder="Email address" type="email" value={regForm.email} onChange={(v) => setRegForm({ ...regForm, email: v })} />
                  <InputField icon={Phone} placeholder="Mobile Number" value={regForm.mobile} onChange={(v) => setRegForm({ ...regForm, mobile: v })} />
                  <InputField icon={MapPin} placeholder="Branch (e.g. Mumbai)" value={regForm.branch} onChange={(v) => setRegForm({ ...regForm, branch: v })} />

                  {/* Role select */}
                  <div className="relative">
                    <Shield className="absolute left-5 top-1/2 -translate-y-1/2 size-5 z-10" style={{ color: GREENS.gray }} />
                    <select
                      value={regForm.role}
                      onChange={(e) => setRegForm({ ...regForm, role: e.target.value })}
                      className="w-full h-[58px] rounded-[18px] border pl-14 pr-5 text-base outline-none appearance-none cursor-pointer"
                      style={{ borderColor: GREENS.border, color: GREENS.text, background: "white" }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="customer_support">Customer Support</option>
                      <option value="branch_manager">Branch Manager</option>
                      <option value="marketing_manager">Marketing Manager</option>
                    </select>
                  </div>

                  <InputField icon={Lock} placeholder="Password" type="password" value={regForm.password} onChange={(v) => setRegForm({ ...regForm, password: v })} />
                  <InputField icon={Lock} placeholder="Confirm Password" type="password" value={regForm.confirm} onChange={(v) => setRegForm({ ...regForm, confirm: v })} />

                  {/* Agree checkbox */}
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer" style={{ color: GREENS.gray }}>
                    <input type="checkbox" checked={regForm.agree} onChange={(e) => setRegForm({ ...regForm, agree: e.target.checked })} className="size-4 mt-0.5 rounded accent-[#72D44C]" />
                    <span>I agree to MyFNG's <a href="#" className="font-medium hover:underline" style={{ color: GREENS.primaryDark }}>Terms of Service</a> and <a href="#" className="font-medium hover:underline" style={{ color: GREENS.primaryDark }}>Privacy Policy</a></span>
                  </label>

                  {/* Create button */}
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02, boxShadow: `0 10px 30px ${GREENS.primary}40` }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-[58px] rounded-[18px] text-white font-bold text-base flex items-center justify-center gap-2 cursor-pointer border-0"
                    style={{ background: GREENS.buttonGrad }}
                  >
                    Create Account <ArrowRight className="size-5" />
                  </motion.button>
                </form>

                {/* Login link */}
                <div className="text-center text-sm mt-7" style={{ color: GREENS.gray }}>
                  Already have an account?{" "}
                  <button onClick={() => setMode("login")} className="font-semibold hover:underline" style={{ color: GREENS.primaryDark }}>
                    Login
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Reusable input field ──────────────────────────────────────────────────
function InputField({ icon: Icon, placeholder, type = "text", value, onChange }: {
  icon: any; placeholder: string; type?: string; value: string; onChange: (v: string) => void;
}) {
  const GREENS = { gray: "#6B7280", border: "#E7E7E7", primary: "#72D44C", text: "#202124" };
  return (
    <div className="relative">
      <Icon className="absolute left-5 top-1/2 -translate-y-1/2 size-5 z-10" style={{ color: GREENS.gray }} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-[58px] rounded-[18px] border pl-14 pr-5 text-base outline-none transition-all"
        style={{ borderColor: GREENS.border, color: GREENS.text }}
        onFocus={(e) => { e.target.style.borderColor = GREENS.primary; e.target.style.boxShadow = `0 0 0 3px ${GREENS.primary}25`; }}
        onBlur={(e) => { e.target.style.borderColor = GREENS.border; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}
