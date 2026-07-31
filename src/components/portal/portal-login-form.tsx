"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

export function PortalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw new Error(error.message || "Invalid credentials");

      await fetch("/api/session", { method: "POST" }).catch(() => null);

      // Confirm portal role
      const me = await fetch("/api/portal/me").then((r) => r.json()).catch(() => null);
      if (!me?.success) {
        await supabase.auth.signOut();
        throw new Error("This account is not a client portal login. Use the main MyFNG login instead.");
      }

      toast.success("Welcome to the Client Portal");
      router.replace("/portal");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg border-slate-200/80">
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>
          Use the email and password your MyFNG partner shared with you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-email">Email</Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-password">Password</Label>
            <Input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <LogIn className="size-4 mr-2" />}
            Sign in to portal
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Staff?{" "}
          <a href="/" className="text-primary underline-offset-2 hover:underline">
            Go to MyFNG admin login
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
