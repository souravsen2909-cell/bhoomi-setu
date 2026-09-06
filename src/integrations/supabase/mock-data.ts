export const MOCK_JURISDICTIONS = [
  { id: "jur-state-1", name: "Haryana", type: "state", parent_id: null },
  { id: "jur-state-2", name: "Maharashtra", type: "state", parent_id: null },
  { id: "jur-state-3", name: "Uttar Pradesh", type: "state", parent_id: null },
  { id: "jur-dist-1", name: "Gurugram", type: "district", parent_id: "jur-state-1" },
  { id: "jur-dist-2", name: "Nagpur", type: "district", parent_id: "jur-state-2" },
  { id: "jur-dist-3", name: "Varanasi", type: "district", parent_id: "jur-state-3" },
];

export const MOCK_PROJECTS = [
  {
    id: "proj-1",
    name: "Delhi-Amritsar-Katra Expressway (NH-70 Package 4)",
    sector: "highway",
    requiring_body: "National Highways Authority of India (NHAI)",
    status: "in_progress",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    estimated_area_ha: 142.5,
    created_at: "2025-01-15T10:00:00.000Z",
  },
  {
    id: "proj-2",
    name: "Nagpur-Goa Shaktipeeth Expressway (Section II)",
    sector: "highway",
    requiring_body: "Maharashtra State Road Development Corp (MSRDC)",
    status: "in_progress",
    state_id: "jur-state-2",
    district_id: "jur-dist-2",
    estimated_area_ha: 210.8,
    created_at: "2025-02-01T11:30:00.000Z",
  },
  {
    id: "proj-3",
    name: "Eastern Dedicated Freight Corridor — Varanasi Bypass",
    sector: "railway",
    requiring_body: "Dedicated Freight Corridor Corporation of India (DFCCIL)",
    status: "notification_published",
    state_id: "jur-state-3",
    district_id: "jur-dist-3",
    estimated_area_ha: 88.3,
    created_at: "2025-03-10T09:15:00.000Z",
  },
];

export const MOCK_PARCELS = [
  // Gurugram parcels
  {
    id: "parcel-1",
    project_id: "proj-1",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    survey_number: "24/1",
    area_hectares: 3.25,
    status: "possession_taken",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [76.98, 28.41],
          [76.986, 28.412],
          [76.988, 28.406],
          [76.981, 28.404],
          [76.98, 28.41],
        ],
      ],
    }),
  },
  {
    id: "parcel-2",
    project_id: "proj-1",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    survey_number: "24/2",
    area_hectares: 4.8,
    status: "award_declared",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [76.988, 28.412],
          [76.995, 28.415],
          [76.997, 28.408],
          [76.988, 28.406],
          [76.988, 28.412],
        ],
      ],
    }),
  },
  {
    id: "parcel-3",
    project_id: "proj-1",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    survey_number: "25/1",
    area_hectares: 2.1,
    status: "notified",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [76.995, 28.415],
          [77.002, 28.417],
          [77.004, 28.41],
          [76.997, 28.408],
          [76.995, 28.415],
        ],
      ],
    }),
  },
  {
    id: "parcel-4",
    project_id: "proj-1",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    survey_number: "25/2",
    area_hectares: 1.75,
    status: "disputed",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [77.002, 28.417],
          [77.009, 28.42],
          [77.011, 28.413],
          [77.004, 28.41],
          [77.002, 28.417],
        ],
      ],
    }),
  },
  {
    id: "parcel-5",
    project_id: "proj-1",
    state_id: "jur-state-1",
    district_id: "jur-dist-1",
    survey_number: "26/1",
    area_hectares: 5.4,
    status: "identified",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [77.009, 28.42],
          [77.016, 28.422],
          [77.018, 28.415],
          [77.011, 28.413],
          [77.009, 28.42],
        ],
      ],
    }),
  },
  // Nagpur parcels
  {
    id: "parcel-6",
    project_id: "proj-2",
    state_id: "jur-state-2",
    district_id: "jur-dist-2",
    survey_number: "112/A",
    area_hectares: 6.2,
    status: "possession_taken",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [79.06, 21.12],
          [79.068, 21.122],
          [79.07, 21.115],
          [79.062, 21.113],
          [79.06, 21.12],
        ],
      ],
    }),
  },
  {
    id: "parcel-7",
    project_id: "proj-2",
    state_id: "jur-state-2",
    district_id: "jur-dist-2",
    survey_number: "112/B",
    area_hectares: 3.9,
    status: "award_declared",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [79.068, 21.122],
          [79.076, 21.125],
          [79.078, 21.118],
          [79.07, 21.115],
          [79.068, 21.122],
        ],
      ],
    }),
  },
  {
    id: "parcel-8",
    project_id: "proj-2",
    state_id: "jur-state-2",
    district_id: "jur-dist-2",
    survey_number: "113",
    area_hectares: 4.15,
    status: "notified",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [79.076, 21.125],
          [79.084, 21.128],
          [79.086, 21.12],
          [79.078, 21.118],
          [79.076, 21.125],
        ],
      ],
    }),
  },
  // Varanasi parcels
  {
    id: "parcel-9",
    project_id: "proj-3",
    state_id: "jur-state-3",
    district_id: "jur-dist-3",
    survey_number: "88/3",
    area_hectares: 2.8,
    status: "possession_taken",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [82.97, 25.32],
          [82.978, 25.323],
          [82.98, 25.316],
          [82.972, 25.314],
          [82.97, 25.32],
        ],
      ],
    }),
  },
  {
    id: "parcel-10",
    project_id: "proj-3",
    state_id: "jur-state-3",
    district_id: "jur-dist-3",
    survey_number: "89/1",
    area_hectares: 3.5,
    status: "notified",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [82.978, 25.323],
          [82.986, 25.326],
          [82.988, 25.319],
          [82.98, 25.316],
          [82.978, 25.323],
        ],
      ],
    }),
  },
  {
    id: "parcel-11",
    project_id: "proj-3",
    state_id: "jur-state-3",
    district_id: "jur-dist-3",
    survey_number: "89/2",
    area_hectares: 1.9,
    status: "disputed",
    geom: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [82.986, 25.326],
          [82.993, 25.328],
          [82.995, 25.321],
          [82.988, 25.319],
          [82.986, 25.326],
        ],
      ],
    }),
  },
];

export const MOCK_AWARDS = [
  { id: "award-1", parcel_id: "parcel-1", declared_amount: 45000000 },
  { id: "award-2", parcel_id: "parcel-2", declared_amount: 62000000 },
  { id: "award-6", parcel_id: "parcel-6", declared_amount: 85000000 },
  { id: "award-7", parcel_id: "parcel-7", declared_amount: 54000000 },
  { id: "award-9", parcel_id: "parcel-9", declared_amount: 38000000 },
];

export const MOCK_COMPENSATION = [
  {
    id: "comp-1",
    award_id: "award-1",
    disbursed_amount: 45000000,
    disbursement_status: "completed",
  },
  {
    id: "comp-2",
    award_id: "award-2",
    disbursed_amount: 25000000,
    disbursement_status: "partially_paid",
  },
  {
    id: "comp-3",
    award_id: "award-6",
    disbursed_amount: 85000000,
    disbursement_status: "completed",
  },
  {
    id: "comp-4",
    award_id: "award-7",
    disbursed_amount: 20000000,
    disbursement_status: "partially_paid",
  },
  {
    id: "comp-5",
    award_id: "award-9",
    disbursed_amount: 38000000,
    disbursement_status: "completed",
  },
];

export const MOCK_AFFECTED_FAMILIES = [
  { id: "fam-1", parcel_id: "parcel-1", members_count: 5 },
  { id: "fam-2", parcel_id: "parcel-1", members_count: 4 },
  { id: "fam-3", parcel_id: "parcel-2", members_count: 6 },
  { id: "fam-4", parcel_id: "parcel-3", members_count: 3 },
  { id: "fam-5", parcel_id: "parcel-4", members_count: 7 },
  { id: "fam-6", parcel_id: "parcel-5", members_count: 4 },
  { id: "fam-7", parcel_id: "parcel-6", members_count: 5 },
  { id: "fam-8", parcel_id: "parcel-7", members_count: 4 },
  { id: "fam-9", parcel_id: "parcel-8", members_count: 6 },
  { id: "fam-10", parcel_id: "parcel-9", members_count: 3 },
  { id: "fam-11", parcel_id: "parcel-10", members_count: 5 },
  { id: "fam-12", parcel_id: "parcel-11", members_count: 4 },
];

export const MOCK_ROLES = [
  { id: 1, name: "Central Ministry Admin", tier: "central_ministry" },
  { id: 2, name: "State Government Officer", tier: "state_government" },
  { id: 3, name: "District Authority / CALA", tier: "district_authority" },
  { id: 4, name: "Implementing Agency Officer", tier: "implementing_agency" },
  { id: 5, name: "Landowner", tier: "landowner" },
];

export const MOCK_USERS = [
  {
    id: "user-demo-officer",
    email: "officer@nhai.gov.in",
    full_name: "Rajesh Sharma",
    role_id: 1,
    is_active: true,
    roles: { id: 1, name: "Central Ministry Admin", tier: "central_ministry" },
  },
];
