/**
 * SMART CAMPUS RIDE ASSISTANT SYSTEM
 * Modular Design - Sprint 3 to 9
 */

// --- Types ---
export interface Location {
    id: string;
    name: string;
    lat: number;
    lng: number;
}

export interface ClassSchedule {
    subject: string;
    startTime: string; // HH:mm
    location: Location;
}

export interface RidePlan {
    destination: string;
    recommendedDeparture: string;
    travelTime: number;
    batterySafety: {
        isSafe: boolean;
        rangeKm: number;
        requiredKm: number;
        suggestion?: string;
    };
    alerts: string[];
    safetyScore: number;
}

// --- SPRINT 3: BATTERY MODULE ---
export const BatteryModule = {
    calculateRange(percentage: number): number {
        // Assumption: 100% = 80km range for campus EVs
        return (percentage / 100) * 80;
    },
    isTripFeasible(batteryPercentage: number, distanceKm: number): boolean {
        const range = this.calculateRange(batteryPercentage);
        return range >= distanceKm;
    }
};

// --- SPRINT 4: SCHEDULE + NAVIGATION ---
export const ScheduleModule = {
    getNextClass(schedule: ClassSchedule[], currentTime: string): ClassSchedule | null {
        const current = new Date(`2000-01-01T${currentTime}`);
        return schedule
            .filter(c => new Date(`2000-01-01T${c.startTime}`) > current)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] || null;
    },
    calculateDeparture(classStartTime: string, travelTimeMinutes: number, bufferMinutes: number = 10): string {
        const start = new Date(`2000-01-01T${classStartTime}`);
        start.setMinutes(start.getMinutes() - (travelTimeMinutes + bufferMinutes));
        return start.toTimeString().slice(0, 5);
    }
};

// --- SPRINT 6: SAFETY MODULE ---
export const SafetyModule = {
    evaluateSafety(speed: number, maxLimit: number, brakingIntensity: number): { score: number; behaviors: string[] } {
        let score = 100;
        const behaviors: string[] = [];

        if (speed > maxLimit) {
            score -= 20;
            behaviors.push('Over-speeding detected');
        }
        if (brakingIntensity > 7) { // 0-10 scale
            score -= 15;
            behaviors.push('Harsh braking detected');
        }

        return { score: Math.max(0, score), behaviors };
    }
};

// --- SPRINT 7: ALERTS MODULE ---
export const AlertsModule = {
    generateAlerts(events: { type: string; value: any }[]): string[] {
        const alerts: string[] = [];
        events.forEach(event => {
            if (event.type === 'LOW_BATTERY') alerts.push(`⚠️ WARNING: Battery low (${event.value}%).`);
            if (event.type === 'DEPARTURE_NEAR') alerts.push(`🔔 NOTIFICATION: Time to leave for ${event.value}.`);
            if (event.type === 'TRAFFIC_DELAY') alerts.push(`🛑 ALERT: Heavy congestion on route.`);
        });
        return alerts;
    }
};

// --- SPRINT 9: RIDE ORCHESTRATOR ---
export const RideOrchestrator = {
    async planNextClassRide(
        studentSchedule: ClassSchedule[],
        currentBattery: number,
        currentLocation: [number, number],
        currentTime: string
    ): Promise<RidePlan | null> {
        // 1. Fetch next class (Sprint 4)
        const nextClass = ScheduleModule.getNextClass(studentSchedule, currentTime);
        if (!nextClass) return null;

        // 2. Determine Route & Travel Time (Sprint 4/Integrated)
        // Simulate distance & travel time for demonstration
        const distanceKm = 2.5; 
        const travelTimeMinutes = 12;

        // 3. Check Battery Safety (Sprint 3 + Sprint 5)
        const rangeAvailable = BatteryModule.calculateRange(currentBattery);
        const isSafe = BatteryModule.isTripFeasible(currentBattery, distanceKm);

        // 4. Trigger Alerts (Sprint 7)
        const eventLog = [];
        if (currentBattery < 20) eventLog.push({ type: 'LOW_BATTERY', value: currentBattery });
        eventLog.push({ type: 'DEPARTURE_NEAR', value: nextClass.subject });

        const alerts = AlertsModule.generateAlerts(eventLog);

        // 5. Build Safety Profile (Sprint 6 - Initial/Historical)
        const safety = SafetyModule.evaluateSafety(0, 40, 0); // Starting fresh

        return {
            destination: nextClass.location.name,
            recommendedDeparture: ScheduleModule.calculateDeparture(nextClass.startTime, travelTimeMinutes),
            travelTime: travelTimeMinutes,
            batterySafety: {
                isSafe,
                rangeKm: rangeAvailable,
                requiredKm: distanceKm,
                suggestion: !isSafe ? 'Recharge now before class' : undefined
            },
            alerts,
            safetyScore: safety.score
        };
    }
};
