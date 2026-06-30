"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2, Loader2, Lock, Mail, Sparkles } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "admin@myfng.in", role: "Super Admin", color: "bg-emerald-500" },
  { email: "marketing@myfng.in", role: "Marketing Manager", color: "bg-amber-500" },
  { email: "thane@myfng.in", role: "Branch Manager", color: "bg-teal-500" },
  { email: "support@myfng.in", role: "Customer Support", color: "bg-rose-500" },
  { email: "viewer@myfng.in", role: "Viewer", color: "bg-slate-500" },
];

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@myfng.in");
  const [password, setPassword] = useState("myfng123");
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
    setPassword("myfng123");
    setLoading(true);
    const res = await signIn("credentials", { email: acc, password: "myfng123", redirect: false });
    setLoading(false);
    if (res?.error) { toast.error("Login failed"); return; }
    toast.success("Signed in");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand panel */}
      <div className="lg:w-1/2 bg-sidebar text-sidebar-foreground flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, var(--sidebar-primary) 0, transparent 40%), radial-gradient(circle at 80% 70%, var(--chart-2) 0, transparent 40%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground shadow-lg">
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="font-semibold text-lg">MyFNG</div>
              <div className="text-xs text-sidebar-foreground/70">Local AI Manager</div>
            </div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
            One dashboard for every MyFNG Google Business Profile.
          </h1>
          <p className="text-sidebar-foreground/70">
            Centralize reviews, posts, local SEO, and analytics across all 15+ MyFNG locations. Powered by MiSA AI for faster, smarter operations.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-4">
            {[
              { icon: "★", label: "Review Management" },
              { icon: "✎", label: "Google Posts" },
              { icon: "⌖", label: "Local SEO Tracking" },
              { icon: "✦", label: "MiSA AI Assistant" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm text-sidebar-foreground/80">
                <span className="text-sidebar-primary font-bold">{f.icon}</span>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-foreground/50">
          Internal Enterprise Platform · Authorized MyFNG personnel only · v1.0
        </div>
      </div>

      {/* Login panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-accent/60 text-accent-foreground px-3 py-1 text-xs font-medium">
              <Sparkles className="size-3" /> MiSA AI Ready
            </div>
            <h2 className="text-2xl font-bold">Sign in to your workspace</h2>
            <p className="text-sm text-muted-foreground">Use your MyFNG SSO credentials to continue.</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Login</CardTitle>
              <CardDescription>Enter your email and password</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@myfng.in" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="••••••••" required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">Quick demo login</span>
              <Separator className="flex-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => quickLogin(acc.email)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-xs hover:bg-accent/40 transition disabled:opacity-50"
                >
                  <span className={`size-2 rounded-full ${acc.color}`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{acc.role}</div>
                    <div className="text-muted-foreground truncate">{acc.email}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">All demo accounts use password <code className="font-mono bg-muted px-1.5 py-0.5 rounded">myfng123</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}
