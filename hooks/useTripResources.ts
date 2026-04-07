"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { analyzeTravelDocument, type DetectedDocumentData } from "@/lib/document-analyzer";

export type TripResource = {
  id: string;
  trip_id: string;
  title: string;
  resource_type: string;
  category: string | null;
  notes: string | null;
  file_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  status: string | null;
  detected_document_type: string | null;
  detected_data: Record<string, unknown> | null;
  linked_reservation_id: string | null;
  created_at: string;
};

export type TripReservation = {
  id: string;
  trip_id: string;
  resource_id: string | null;
  reservation_type: string;
  provider_name: string | null;
  reservation_name: string;
  reservation_code: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  check_in_date: string | null;
  check_in_time: string | null;
  check_out_date: string | null;
  check_out_time: string | null;
  nights: number | null;
  guests: number | null;
  total_amount: number | null;
  currency: string | null;
  payment_status: "paid" | "pending";
  notes: string | null;
  status: string;
  detected_document_type: string | null;
  detected_data: Record<string, unknown> | null;
  sync_to_plan: boolean;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

export type ResourceUploadResult = {
  path: string;
  publicUrl: string | null;
  mimeType: string | null;
};

function getFileExtension(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop() : "bin";
}

function calculateNights(checkInDate?: string | null, checkOutDate?: string | null) {
  if (!checkInDate || !checkOutDate) return null;

  const start = new Date(checkInDate);
  const end = new Date(checkOutDate);
  const diffMs = end.getTime() - start.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) return null;

  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function useTripResources(tripId: string) {
  const [resources, setResources] = useState<TripResource[]>([]);
  const [reservations, setReservations] = useState<TripReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apiRequest<T>(input: RequestInfo, init: RequestInit, label: string): Promise<T> {
    const resp = await fetch(input, init);
    const text = await resp.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text || "Respuesta no JSON." };
    }
    if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status} (${label})`);
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const payload = await apiRequest<{ resources: TripResource[]; reservations: TripReservation[] }>(
        `/api/trip-resources?tripId=${encodeURIComponent(tripId)}`,
        { method: "GET" },
        "cargar recursos"
      );
      setResources(Array.isArray(payload.resources) ? payload.resources : []);
      setReservations(Array.isArray(payload.reservations) ? payload.reservations : []);
    } catch (err) {
      console.error("Error cargando recursos/reservas:", err);
      setResources([]);
      setReservations([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar recursos");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFile = useCallback(
    async (file: File): Promise<ResourceUploadResult> => {
      if (!file) {
        throw new Error("No se ha recibido ningún archivo.");
      }

      const extension = getFileExtension(file.name || "file");
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const path = `${tripId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("trip-documents")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "No se pudo subir el archivo a Storage.");
      }

      const { data } = supabase.storage.from("trip-documents").getPublicUrl(path);

      return {
        path,
        publicUrl: data.publicUrl ?? null,
        mimeType: file.type || null,
      };
    },
    [tripId]
  );

  const createResource = useCallback(
    async (input: {
      title: string;
      resourceType?: string;
      category?: string | null;
      notes?: string | null;
      detectedDocumentType?: string | null;
      detectedData?: Record<string, unknown> | null;
      linkedReservationId?: string | null;
      upload?: ResourceUploadResult | null;
    }) => {
      setSaving(true);
      setError(null);

      try {
        const payload = {
          tripId,
          title: input.title.trim(),
          resource_type: input.resourceType || "document",
          category: input.category || null,
          notes: input.notes || null,
          file_path: input.upload?.path || null,
          file_url: input.upload?.publicUrl || null,
          mime_type: input.upload?.mimeType || null,
          detected_document_type: input.detectedDocumentType || null,
          detected_data: input.detectedData || {},
          linked_reservation_id: input.linkedReservationId || null,
        };

        const result = await apiRequest<{ resource: TripResource }>(
          "/api/trip-resources",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
          "crear recurso"
        );
        await load();
        return result.resource;
      } finally {
        setSaving(false);
      }
    },
    [load, tripId]
  );

  const createReservation = useCallback(
    async (input: {
      resourceId?: string | null;
      reservationType?: string;
      providerName?: string | null;
      reservationName: string;
      reservationCode?: string | null;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      checkInDate?: string | null;
      checkInTime?: string | null;
      checkOutDate?: string | null;
      checkOutTime?: string | null;
      guests?: number | null;
      totalAmount?: number | null;
      currency?: string | null;
      paymentStatus: "paid" | "pending";
      notes?: string | null;
      detectedDocumentType?: string | null;
      detectedData?: Record<string, unknown> | null;
      syncToPlan?: boolean;
      latitude?: number | null;
      longitude?: number | null;
    }) => {
      setSaving(true);
      setError(null);

      try {
        const payload = {
          tripId,
          resource_id: input.resourceId || null,
          reservation_type: input.reservationType || "lodging",
          provider_name: input.providerName || null,
          reservation_name: input.reservationName.trim(),
          reservation_code: input.reservationCode || null,
          address: input.address || null,
          city: input.city || null,
          country: input.country || null,
          check_in_date: input.checkInDate || null,
          check_in_time: input.checkInTime || null,
          check_out_date: input.checkOutDate || null,
          check_out_time: input.checkOutTime || null,
          nights: calculateNights(input.checkInDate, input.checkOutDate),
          guests: input.guests || null,
          total_amount: input.totalAmount ?? null,
          currency: input.currency || "EUR",
          payment_status: input.paymentStatus,
          notes: input.notes || null,
          detected_document_type: input.detectedDocumentType || null,
          detected_data: input.detectedData || {},
          sync_to_plan: input.syncToPlan ?? (input.reservationType === "lodging"),
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        };

        const result = await apiRequest<{ reservation: TripReservation }>(
          "/api/trip-reservations",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
          "crear reserva"
        );
        await load();
        return result.reservation;
      } finally {
        setSaving(false);
      }
    },
    [load, tripId]
  );

  const updateReservation = useCallback(
    async (
      reservationId: string,
      input: {
        providerName?: string | null;
        reservationName: string;
        reservationCode?: string | null;
        address?: string | null;
        city?: string | null;
        country?: string | null;
        checkInDate?: string | null;
        checkInTime?: string | null;
        checkOutDate?: string | null;
        checkOutTime?: string | null;
        guests?: number | null;
        totalAmount?: number | null;
        currency?: string | null;
        paymentStatus: "paid" | "pending";
        notes?: string | null;
        syncToPlan?: boolean;
        latitude?: number | null;
        longitude?: number | null;
      }
    ) => {
      setSaving(true);
      setError(null);

      try {
        const payload = {
          provider_name: input.providerName || null,
          reservation_name: input.reservationName.trim(),
          reservation_code: input.reservationCode || null,
          address: input.address || null,
          city: input.city || null,
          country: input.country || null,
          check_in_date: input.checkInDate || null,
          check_in_time: input.checkInTime || null,
          check_out_date: input.checkOutDate || null,
          check_out_time: input.checkOutTime || null,
          nights: calculateNights(input.checkInDate, input.checkOutDate),
          guests: input.guests || null,
          total_amount: input.totalAmount ?? null,
          currency: input.currency || "EUR",
          payment_status: input.paymentStatus,
          notes: input.notes || null,
          sync_to_plan: input.syncToPlan ?? true,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        };

        await apiRequest<{ reservation: TripReservation }>(
          `/api/trip-reservations/${reservationId}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
          "actualizar reserva"
        );
        await load();
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const deleteResource = useCallback(
    async (resourceId: string) => {
      const confirmed = window.confirm("¿Seguro que quieres eliminar este recurso?");
      if (!confirmed) return;

      setSaving(true);
      setError(null);

      try {
        await apiRequest<{ ok: true }>(`/api/trip-resources/${resourceId}`, { method: "DELETE" }, "borrar recurso");
        await load();
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const deleteReservation = useCallback(
    async (reservationId: string) => {
      const confirmed = window.confirm("¿Seguro que quieres eliminar esta reserva?");
      if (!confirmed) return;

      setSaving(true);
      setError(null);

      try {
        await apiRequest<{ ok: true }>(
          `/api/trip-reservations/${reservationId}`,
          { method: "DELETE" },
          "borrar reserva"
        );
        await load();
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const analyzeDocument = useCallback(async (input: {
    fileName: string;
    rawText: string;
  }) => {
    setAnalyzing(true);
    setError(null);

    try {
      const result = analyzeTravelDocument(input.rawText);
      return result satisfies DetectedDocumentData;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  return {
    resources,
    reservations,
    loading,
    saving,
    analyzing,
    error,
    reload: load,
    uploadFile,
    createResource,
    createReservation,
    updateReservation,
    deleteResource,
    deleteReservation,
    analyzeDocument,
  };
}
