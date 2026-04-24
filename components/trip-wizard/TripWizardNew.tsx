"use client";

import { useState } from "react";
import Step1Essential from "./steps/Step1-Essential";
import Step2Preferences from "./steps/Step2-Preferences";
import Step3Generating from "./steps/Step3-Generating";
import Step4Preview from "./steps/Step4-Preview";

export type TripWizardStep = 1 | 2 | 3 | 4;

export type WizardFormData = {
  // Step 1: Lo Esencial
  tripName: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;

  // Step 2: Contexto y Preferencias
  travelersType?: "solo" | "couple" | "friends" | "family" | null;
  budgetLevel?: "low" | "medium" | "high" | null;
  activityPace?: "relaxed" | "normal" | "intense" | null;
  interests?: string[];
  specificDestinations?: string[];
  accommodationCities?: Array<{
    city: string;
    checkInDate: string;
    checkOutDate: string;
  }>;

  // Step 3: Generados por IA
  generatedItinerary?: any; // ExecutableItinerary
  generatedAccommodations?: any[];
  generatedRoutes?: any[];
};

export default function TripWizardNew({
  onComplete,
}: {
  onComplete?: (tripId: string) => void;
}) {
  const [step, setStep] = useState<TripWizardStep>(1);
  const [formData, setFormData] = useState<WizardFormData>({
    tripName: "",
    destination: "",
    startDate: null,
    endDate: null,
    durationDays: null,
  });
  const [error, setError] = useState<string | null>(null);

  const handleNext = (data: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
    setError(null);
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as TripWizardStep);
  };

  const handlePreviewUpdate = (updates: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1 mx-1 rounded-full transition-colors ${
                  s <= step ? "bg-violet-500" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-slate-600 text-center">
            Paso {step} de 4
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {step === 1 && (
            <Step1Essential
              data={formData}
              onNext={handleNext}
              onError={setError}
            />
          )}

          {step === 2 && (
            <Step2Preferences
              data={formData}
              onNext={handleNext}
              onBack={handleBack}
              onError={setError}
            />
          )}

          {step === 3 && (
            <Step3Generating
              data={formData}
              onNext={handleNext}
              onBack={handleBack}
              onError={setError}
            />
          )}

          {step === 4 && (
            <Step4Preview
              data={formData}
              onBack={handleBack}
              onComplete={onComplete}
              onUpdate={handlePreviewUpdate}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}
