"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Mail, Lock, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@myfng.in");
  const [password, setPassword] = useState("MyFNG@2025");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.error("Invalid credentials. Try a demo account below.");
      return;
    }
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

  return (
    <div className="min-h-screen flex">
      {/* ═══ LEFT PANEL — Mint gradient with brand ═══════════════════════ */}
      <div
        className="hidden lg:flex lg:w-3/5 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(180deg, #C8E6C9 0%, #81C784 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute top-10 right-10 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-20 left-10 size-48 rounded-full bg-white/10 blur-xl" />
        <div className="absolute top-1/3 right-1/4 size-32 rounded-full bg-white/5 blur-lg" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="size-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
            <Building2 className="size-6 text-white" />
          </div>
          <div>
            <div className="font-bold text-xl text-white">MyFNG</div>
            <div className="text-xs text-white/70">Local AI Manager</div>
          </div>
        </div>

        {/* Center content */}
        <div className="relative z-10 max-w-lg">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            One dashboard for every MyFNG Google Business Profile.
          </h1>
          <p className="text-white/80 text-lg leading-relaxed mb-8">
            Centralize reviews, posts, local SEO, and analytics across all MyFNG locations. Powered by MiSA AI for faster, smarter operations.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "★", label: "Review Management" },
              { icon: "✎", label: "Google Posts" },
              { icon: "⌖", label: "Local SEO Tracking" },
              { icon: "✦", label: "MiSA AI Assistant" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 text-sm text-white/90 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
                <span className="text-amber-300 font-bold text-base">{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-white/50">
          Internal Enterprise Platform · Authorized MyFNG personnel only · v1.0
        </div>
      </div>

      {/* ═══ RIGHT PANEL — White form card ════════════════════════════════ */}
      <div className="w-full lg:w-2/5 flex items-center justify-center bg-white p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8 justify-center">
            <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: "#81C784" }}>
              <Building2 className="size-5 text-white" />
            </div>
            <span className="font-bold text-lg" style={{ color: "#2E7D32" }}>MyFNG</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900">Sign in</h2>
            <p className="text-sm text-gray-500 mt-1">Use your MyFNG SSO credentials to continue.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 rounded-lg border-gray-200 focus:border-[#81C784] focus:ring-[#81C784] focus:ring-1"
                  placeholder="you@myfng.in"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-11 rounded-lg border-gray-200 focus:border-[#81C784] focus:ring-[#81C784] focus:ring-1"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg text-white font-semibold text-base border-0 hover:opacity-90 transition"
              style={{ background: "#81C784" }}
            >
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or sign in with</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Social buttons */}
          <div className="flex items-center justify-center gap-3">
            {/* Google */}
            <button className="size-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition" title="Google">
              <svg className="size-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </button>
            {/* GitHub */}
            <button className="size-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition" title="GitHub">
              <svg className="size-4" viewBox="0 0 24 24" fill="#181717">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </button>
            {/* Apple */}
            <button className="size-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition" title="Apple">
              <svg className="size-4" viewBox="0 0 24 24" fill="#000000">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            </button>
          </div>

          {/* Terms */}
          <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
            By signing in you agree to MyFNG's{" "}
            <a className="text-[#81C784] underline hover:opacity-80" href="#">Terms of Service</a>{" "}
            and{" "}
            <a className="text-[#81C784] underline hover:opacity-80" href="#">Privacy Policy</a>.
          </p>

          {/* Demo accounts */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <div className="flex items-center gap-1.5 mb-3 justify-center">
              <Sparkles className="size-3 text-[#81C784]" />
              <span className="text-xs text-gray-400">Quick demo login</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { email: "admin@myfng.in", role: "Super Admin", color: "#81C784" },
                { email: "marketing@myfng.in", role: "Marketing Manager", color: "#66BB6A" },
                { email: "thane@myfng.in", role: "Branch Manager", color: "#4CAF50" },
                { email: "support@myfng.in", role: "Customer Support", color: "#2E7D32" },
                { email: "viewer@myfng.in", role: "Viewer", color: "#9E9E9E" },
              ].map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => quickLogin(acc.email)}
                  disabled={loading}
                  className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50 transition disabled:opacity-50"
                >
                  <span className="size-2 rounded-full shrink-0" style={{ background: acc.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-700 truncate">{acc.role}</div>
                    <div className="text-gray-400 truncate">{acc.email}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-[11px] text-gray-400 mt-3">
              All demo accounts use password <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">MyFNG@2025</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
