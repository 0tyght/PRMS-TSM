USE prms_tsm;

SET NAMES utf8mb4;

UPDATE waste_routes
SET route_name =
  CASE route_code
    WHEN 'THP-OFFICIAL-01'
      THEN 'มหาวิทยาลัยนเรศวร – วัดสะกัดน้ำมัน'

    WHEN 'THP-OFFICIAL-02'
      THEN 'สำนักงานเทศบาล – บ้านสวน – แกรนด์โฮม'

    WHEN 'THP-OFFICIAL-03'
      THEN 'นเรศวรคอนโด – ประตู 6 – หมู่ 3'

    WHEN 'THP-OFFICIAL-04'
      THEN 'ถนนพิษณุโลก–กำแพงดิน – วัดยางเอน'

    WHEN 'THP-OFFICIAL-05'
      THEN 'หมู่ 7 – หมู่ 8 – ถนนพิษณุโลก–กำแพงดิน'

    WHEN 'THP-OFFICIAL-06'
      THEN 'หนองอ้อ – คลองหนองเหล็ก – หมู่ 9'

    ELSE route_name
  END
WHERE route_code IN (
  'THP-OFFICIAL-01',
  'THP-OFFICIAL-02',
  'THP-OFFICIAL-03',
  'THP-OFFICIAL-04',
  'THP-OFFICIAL-05',
  'THP-OFFICIAL-06'
);

UPDATE waste_routes
SET route_geojson =
  JSON_REMOVE(
    JSON_SET(
      route_geojson,
      '$.properties.sourceVehicleNo',
      JSON_EXTRACT(
        route_geojson,
        '$.properties.vehicleNo'
      )
    ),
    '$.properties.vehicleNo'
  )
WHERE JSON_EXTRACT(
  route_geojson,
  '$.properties.vehicleNo'
) IS NOT NULL;

SELECT
  'Migration 024 completed successfully'
  AS migration_status;
