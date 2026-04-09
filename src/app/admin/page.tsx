"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    // Signal to the main page that admin login should open
    sessionStorage.setItem("bcproxy_open_admin_login", "1");
    router.replace("/");
  }, [router]);
  return null;
}
