import assert from "node:assert/strict";
import { computeRentalTaxCase } from "../../src";
import type { ComputeRentalTaxCaseInput, FilingProfile, Owner, OwnershipPeriod, Property, UsageYear } from "../../src";

function makeOwner(id: string, firstName: string, lastName: string, role: Owner["role"] = "legal_owner"): Owner {
  return {
    id,
    role,
    personType: "natural_person",
    firstName,
    lastName,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "property-1",
    displayName: "Musterobjekt",
    propertyType: "apartment",
    countryCode: "DE",
    isResidential: true,
    yearBuilt: 1998,
    ...overrides,
  };
}

function makeUsageYear(overrides: Partial<UsageYear> = {}): UsageYear {
  return {
    id: "usage-1",
    propertyId: "property-1",
    taxYear: 2025,
    totalDays: 365,
    rentalDays: 365,
    vacancyDays: 0,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ComputeRentalTaxCaseInput> = {}): ComputeRentalTaxCaseInput {
  return {
    policyPackId: "de-rental-2025",
    formPackId: "elster-income-2025",
    taxYear: 2025,
    taxSubject: {
      id: "subject-1",
      displayName: "Max Mustermann",
      subjectKind: "person",
      residencyStatus: "unlimited_tax",
      filingCountry: "DE",
      owners: [makeOwner("owner-1", "Max", "Mustermann")],
    },
    properties: [makeProperty()],
    usageYears: [makeUsageYear()],
    ownershipPeriods: [
      {
        id: "period-1",
        propertyId: "property-1",
        ownerId: "owner-1",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        numerator: 1,
        denominator: 1,
        reason: "initial",
      },
    ],
    revenues: [],
    expenses: [],
    assets: [],
    maintenancePlans: [],
    loans: [],
    ownerSpecificItems: [],
    filingsContext: {},
    overrides: [],
    evidence: [],
    ...overrides,
  };
}

function firstPreviewProfile(input: ComputeRentalTaxCaseInput): FilingProfile | undefined {
  const output = computeRentalTaxCase(input);
  return output.filingsPreview.previews[0]?.filingProfile;
}

function testSingleOwnerStandard() {
  const output = computeRentalTaxCase(makeInput({
    revenues: [
      {
        id: "rev-rent",
        propertyId: "property-1",
        taxYear: 2025,
        bookingDate: "2025-01-03",
        category: "cold_rent",
        grossCents: 1_200_000,
      },
      {
        id: "rev-nk",
        propertyId: "property-1",
        taxYear: 2025,
        bookingDate: "2025-02-03",
        category: "allocated_ancillary_prepayment",
        grossCents: 60_000,
      },
    ],
    expenses: [
      {
        id: "exp-tax",
        propertyId: "property-1",
        taxYear: 2025,
        bookingDate: "2025-03-02",
        description: "Grundsteuer",
        amountCents: 160_000,
        category: "property_tax",
        allocationMode: "full",
      },
      {
        id: "exp-interest",
        propertyId: "property-1",
        taxYear: 2025,
        bookingDate: "2025-03-15",
        description: "Zinsen",
        amountCents: 300_000,
        category: "loan_interest",
        allocationMode: "full",
      },
    ],
    assets: [
      {
        id: "asset-building",
        propertyId: "property-1",
        assetType: "building",
        description: "Gebäude",
        acquisitionCostCents: 25_000_000,
      },
    ],
  }));

  assert.equal(output.status, "ok");
  assert.equal(output.classification.filingProfile, "est1a_v");
  assert.equal(output.calculations.revenueTotals.totalCents, 1_260_000);
  assert.equal(output.calculations.deductionResult.deductibleExpenseCents, 460_000);
  assert.equal(output.calculations.depreciationResult.totalCents, 500_000);
  assert.equal(output.calculations.totalResultCents, 300_000);
}

function testThreeOwnersDoNotFalseBlock() {
  const owners = [
    makeOwner("owner-a", "Uta", "Tacke"),
    makeOwner("owner-b", "Maurus", "Tacke"),
    makeOwner("owner-c", "Leo", "Tacke"),
  ];
  const periods: OwnershipPeriod[] = [
    { id: "p1", propertyId: "property-1", ownerId: "owner-a", startDate: "2025-01-01", endDate: "2025-12-31", numerator: 1, denominator: 8, reason: "initial" },
    { id: "p2", propertyId: "property-1", ownerId: "owner-b", startDate: "2025-01-01", endDate: "2025-12-31", numerator: 1, denominator: 8, reason: "initial" },
    { id: "p3", propertyId: "property-1", ownerId: "owner-c", startDate: "2025-01-01", endDate: "2025-12-31", numerator: 3, denominator: 4, reason: "initial" },
  ];
  const output = computeRentalTaxCase(makeInput({
    taxSubject: {
      id: "subject-assessment",
      displayName: "GbR",
      subjectKind: "assessment_unit",
      ownershipModelHint: "partnership_asset_management",
      residencyStatus: "unlimited_tax",
      filingCountry: "DE",
      owners,
    },
    ownershipPeriods: periods,
    revenues: [{
      id: "rev-1",
      propertyId: "property-1",
      taxYear: 2025,
      bookingDate: "2025-12-31",
      category: "cold_rent",
      grossCents: 100_000,
    }],
  }));

  assert.notEqual(output.status, "blocking_error");
  assert.equal(output.classification.filingProfile, "est1b_fb_v");
  const lines = output.ownerAllocations[0].lines;
  assert.equal(lines.find((line) => line.ownerId === "owner-a")?.resultCents, 12_500);
  assert.equal(lines.find((line) => line.ownerId === "owner-b")?.resultCents, 12_500);
  assert.equal(lines.find((line) => line.ownerId === "owner-c")?.resultCents, 75_000);
}

function testMidYearShareChange() {
  const output = computeRentalTaxCase(makeInput({
    taxSubject: {
      id: "subject-2",
      displayName: "Miteigentümer",
      subjectKind: "person",
      residencyStatus: "unlimited_tax",
      filingCountry: "DE",
      owners: [makeOwner("owner-a", "Anna", "A"), makeOwner("owner-b", "Ben", "B")],
    },
    ownershipPeriods: [
      { id: "a1", propertyId: "property-1", ownerId: "owner-a", startDate: "2025-01-01", endDate: "2025-06-30", numerator: 1, denominator: 2, reason: "initial" },
      { id: "b1", propertyId: "property-1", ownerId: "owner-b", startDate: "2025-01-01", endDate: "2025-06-30", numerator: 1, denominator: 2, reason: "initial" },
      { id: "b2", propertyId: "property-1", ownerId: "owner-b", startDate: "2025-07-01", endDate: "2025-12-31", numerator: 1, denominator: 1, reason: "contract_change" },
    ],
    revenues: [{
      id: "rev-mid",
      propertyId: "property-1",
      taxYear: 2025,
      bookingDate: "2025-12-31",
      category: "cold_rent",
      grossCents: 36_500,
    }],
  }));

  const lines = output.ownerAllocations[0].lines;
  assert.equal(lines.find((line) => line.ownerId === "owner-a")?.resultCents, 9_050);
  assert.equal(lines.find((line) => line.ownerId === "owner-b")?.resultCents, 27_450);
}

function testDistributedMaintenanceNotDoubleCounted() {
  const output = computeRentalTaxCase(makeInput({
    expenses: [{
      id: "maintenance-source",
      propertyId: "property-1",
      taxYear: 2025,
      bookingDate: "2025-04-01",
      description: "Erhaltungsaufwand",
      amountCents: 300_000,
      category: "maintenance_candidate",
      allocationMode: "full",
    }],
    maintenancePlans: [{
      id: "plan-1",
      propertyId: "property-1",
      originTaxYear: 2025,
      firstDeductionTaxYear: 2025,
      distributionYears: 3,
      annualShareCents: 100_000,
      originalAmountCents: 300_000,
      sourceExpenseIds: ["maintenance-source"],
      status: "active",
    }],
  }));

  assert.equal(output.calculations.deductionResult.deductibleExpenseCents, 0);
  assert.equal(output.calculations.maintenancePlans.length, 1);
  assert.equal(output.calculations.totalResultCents, -100_000);
}

function testAcquisitionNearCostsTrigger() {
  const output = computeRentalTaxCase(makeInput({
    properties: [makeProperty({ acquisitionDate: "2025-01-01" })],
    expenses: [{
      id: "exp-acq-near",
      propertyId: "property-1",
      taxYear: 2025,
      bookingDate: "2025-06-01",
      description: "Sanierung",
      amountCents: 4_000_000,
      category: "maintenance_candidate",
      allocationMode: "full",
    }],
    assets: [{
      id: "asset-building",
      propertyId: "property-1",
      assetType: "building",
      description: "Gebäude",
      acquisitionCostCents: 20_000_000,
    }],
  }));

  assert.equal(output.status, "blocking_error");
  assert.ok(output.blockingErrors.some((error) => error.code === "ACQUISITION_NEAR_COSTS_NOT_CLASSIFIED"));
  assert.equal(output.calculations.deductionResult.deductibleExpenseCents, 0);
}

function testHolidayApartmentReview() {
  const output = computeRentalTaxCase(makeInput({
    usageYears: [makeUsageYear({
      rentalModeHint: "mixed_use",
      totalDays: 365,
      selfUseDays: 17,
      rentalDays: 200,
      vacancyDays: 148,
      thirdPartyBrokerManaged: true,
    })],
  }));

  assert.equal(output.status, "review_required");
  assert.equal(firstPreviewProfile(makeInput({
    usageYears: [makeUsageYear({
      rentalModeHint: "mixed_use",
      totalDays: 365,
      selfUseDays: 17,
      rentalDays: 200,
      vacancyDays: 148,
      thirdPartyBrokerManaged: true,
    })],
  })), "est1a_v_fewo");
  assert.ok(output.reviewFlags.some((flag) => flag.code === "HOLIDAY_APARTMENT_INTENTION_REVIEW"));
}

function run() {
  testSingleOwnerStandard();
  testThreeOwnersDoNotFalseBlock();
  testMidYearShareChange();
  testDistributedMaintenanceNotDoubleCounted();
  testAcquisitionNearCostsTrigger();
  testHolidayApartmentReview();
  console.log("tax-engine-rental-de verification passed: 6/6 scenarios");
}

run();
