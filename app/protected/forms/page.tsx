"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateFormDialog } from "@/components/forms/create-form-dialog";
import { getForms } from "@/lib/api/forms";
import { Form } from "@/lib/types/form";
import { format } from "date-fns";

export default function FormsPage() {
  return null;
} 