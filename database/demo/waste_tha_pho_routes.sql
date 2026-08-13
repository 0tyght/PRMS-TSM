USE prms_tsm;

SET NAMES utf8mb4;

-- ข้อมูลนำร่องจากสถานที่และแนวเส้นทางที่ปรากฏในประกาศการเก็บและขนขยะมูลฝอย พ.ศ. 2566
-- ของเทศบาลท่าโพธ์ ประกอบกับแนวถนน OpenStreetMap/OSRM (สืบค้น 13 สิงหาคม 2569)
-- ต้องให้เจ้าหน้าที่กองสาธารณสุขตรวจลำดับ จุดกลับรถ และถนนที่รถเข้าถึงได้ก่อนใช้จัดแผนจริง

INSERT INTO waste_routes (id, route_code, route_name, description, route_geojson, is_active)
VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'THP-NU-01',
    'พื้นที่มหาวิทยาลัยนเรศวรและถนนบรมทวี',
    'เส้นทางนำร่องอ้างอิงประกาศเทศบาล: มินิ Big-C, NU Plaza, มหาวิทยาลัยนเรศวร, โรงพยาบาลมหาวิทยาลัยนเรศวร และพิพิธภัณฑ์ผ้า; แนวถนนจาก OpenStreetMap/OSRM ต้องตรวจภาคสนามก่อนใช้งานจริง',
    JSON_OBJECT(
      'type','Feature',
      'properties',JSON_OBJECT(
        'waypoints',JSON_ARRAY(
          JSON_OBJECT('latitude',16.7538191,'longitude',100.1966309,'name','มินิ Big-C ถนนบรมทวี'),
          JSON_OBJECT('latitude',16.7523122,'longitude',100.1964895,'name','NU Plaza'),
          JSON_OBJECT('latitude',16.7427140,'longitude',100.1948931,'name','มหาวิทยาลัยนเรศวร'),
          JSON_OBJECT('latitude',16.7485505,'longitude',100.1893614,'name','โรงพยาบาลมหาวิทยาลัยนเรศวร'),
          JSON_OBJECT('latitude',16.7508607,'longitude',100.1935416,'name','พิพิธภัณฑ์ผ้า มหาวิทยาลัยนเรศวร')
        ),
        'distanceMeters',4277,
        'durationSeconds',742,
        'source','ประกาศเทศบาลท่าโพธ์ พ.ศ. 2566 + OpenStreetMap/OSRM; ข้อมูลนำร่องรอตรวจภาคสนาม'
      ),
      'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(
        JSON_ARRAY(100.19673,16.753845),JSON_ARRAY(100.196202,16.753463),JSON_ARRAY(100.195922,16.752695),JSON_ARRAY(100.196692,16.752002),JSON_ARRAY(100.1966,16.751721),JSON_ARRAY(100.196608,16.750641),JSON_ARRAY(100.197301,16.748955),JSON_ARRAY(100.197715,16.748003),JSON_ARRAY(100.198229,16.746758),JSON_ARRAY(100.199107,16.744754),JSON_ARRAY(100.198048,16.743555),JSON_ARRAY(100.196761,16.742178),JSON_ARRAY(100.195777,16.742381),JSON_ARRAY(100.194207,16.742938),JSON_ARRAY(100.192063,16.742945),JSON_ARRAY(100.191066,16.74451),JSON_ARRAY(100.189594,16.747017),JSON_ARRAY(100.189626,16.747407),JSON_ARRAY(100.190247,16.748689),JSON_ARRAY(100.190234,16.749083),JSON_ARRAY(100.189953,16.749636),JSON_ARRAY(100.18973,16.749631),JSON_ARRAY(100.190082,16.749136),JSON_ARRAY(100.188888,16.749547),JSON_ARRAY(100.189219,16.750093),JSON_ARRAY(100.189652,16.750813),JSON_ARRAY(100.191332,16.749883),JSON_ARRAY(100.193038,16.74974),JSON_ARRAY(100.193881,16.750408),JSON_ARRAY(100.193729,16.750912)
      ))
    ),
    1
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'THP-COM-01',
    'ชุมชนท่าโพธ์ วัดสะกัดน้ำมัน และวัดยางเอน',
    'เส้นทางนำร่องในชุมชนท่าโพธ์ เชื่อมวัดสะกัดน้ำมันและวัดยางเอน; สถานที่อยู่ในเขตท่าโพธ์ตาม OpenStreetMap และต้องตรวจถนนซอยกับจุดกลับรถก่อนใช้จริง',
    JSON_OBJECT(
      'type','Feature',
      'properties',JSON_OBJECT(
        'waypoints',JSON_ARRAY(
          JSON_OBJECT('latitude',16.7603804,'longitude',100.2030017,'name','ชุมชนท่าโพธ์'),
          JSON_OBJECT('latitude',16.7580059,'longitude',100.2090336,'name','วัดสะกัดน้ำมัน'),
          JSON_OBJECT('latitude',16.7664083,'longitude',100.2053897,'name','วัดยางเอน'),
          JSON_OBJECT('latitude',16.7603804,'longitude',100.2030017,'name','กลับชุมชนท่าโพธ์')
        ),
        'distanceMeters',6442,
        'durationSeconds',755,
        'source','OpenStreetMap/OSRM; ข้อมูลนำร่องรอตรวจภาคสนาม'
      ),
      'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(
        JSON_ARRAY(100.20316,16.760372),JSON_ARRAY(100.20312,16.762003),JSON_ARRAY(100.204356,16.762831),JSON_ARRAY(100.20462,16.764253),JSON_ARRAY(100.204809,16.764742),JSON_ARRAY(100.202077,16.765688),JSON_ARRAY(100.206959,16.763783),JSON_ARRAY(100.209234,16.76309),JSON_ARRAY(100.208101,16.76363),JSON_ARRAY(100.206021,16.763149),JSON_ARRAY(100.20615,16.761118),JSON_ARRAY(100.2069,16.75976),JSON_ARRAY(100.208865,16.757899),JSON_ARRAY(100.20671,16.760034),JSON_ARRAY(100.206009,16.761417),JSON_ARRAY(100.206335,16.763644),JSON_ARRAY(100.209099,16.762749),JSON_ARRAY(100.202136,16.765324),JSON_ARRAY(100.202637,16.764927),JSON_ARRAY(100.2047,16.764319),JSON_ARRAY(100.204788,16.764849),JSON_ARRAY(100.204995,16.766397),JSON_ARRAY(100.205585,16.766405),JSON_ARRAY(100.205092,16.764683),JSON_ARRAY(100.204668,16.764281),JSON_ARRAY(100.204364,16.763267),JSON_ARRAY(100.203634,16.762362),JSON_ARRAY(100.203162,16.760401),JSON_ARRAY(100.20316,16.760372)
      ))
    ),
    1
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'THP-BRM-01',
    'ชุมชนท่าโพธ์ ถนนบรมทวี และมหาวิทยาลัยนเรศวร',
    'แนวเชื่อมชุมชนท่าโพธ์กับย่านที่พักและร้านค้าบนถนนบรมทวีจนถึงมหาวิทยาลัยนเรศวร; อ้างอิงสถานที่จริงและแนวถนน OpenStreetMap/OSRM ต้องตรวจภาคสนามก่อนใช้จริง',
    JSON_OBJECT(
      'type','Feature',
      'properties',JSON_OBJECT(
        'waypoints',JSON_ARRAY(
          JSON_OBJECT('latitude',16.7603804,'longitude',100.2030017,'name','ชุมชนท่าโพธ์'),
          JSON_OBJECT('latitude',16.7538191,'longitude',100.1966309,'name','มินิ Big-C ถนนบรมทวี'),
          JSON_OBJECT('latitude',16.7523122,'longitude',100.1964895,'name','NU Plaza'),
          JSON_OBJECT('latitude',16.7427140,'longitude',100.1948931,'name','มหาวิทยาลัยนเรศวร')
        ),
        'distanceMeters',5187,
        'durationSeconds',730,
        'source','ประกาศเทศบาลท่าโพธ์ พ.ศ. 2566 + OpenStreetMap/OSRM; ข้อมูลนำร่องรอตรวจภาคสนาม'
      ),
      'geometry',JSON_OBJECT('type','LineString','coordinates',JSON_ARRAY(
        JSON_ARRAY(100.20316,16.760372),JSON_ARRAY(100.201926,16.76007),JSON_ARRAY(100.201718,16.761482),JSON_ARRAY(100.201252,16.764079),JSON_ARRAY(100.200199,16.765828),JSON_ARRAY(100.19838,16.765419),JSON_ARRAY(100.198801,16.763918),JSON_ARRAY(100.199905,16.760375),JSON_ARRAY(100.200832,16.757079),JSON_ARRAY(100.201115,16.755628),JSON_ARRAY(100.201346,16.755115),JSON_ARRAY(100.200978,16.755014),JSON_ARRAY(100.19983,16.754315),JSON_ARRAY(100.199139,16.754042),JSON_ARRAY(100.198567,16.753903),JSON_ARRAY(100.197291,16.753825),JSON_ARRAY(100.196558,16.754453),JSON_ARRAY(100.196399,16.75501),JSON_ARRAY(100.196759,16.753743),JSON_ARRAY(100.195924,16.752729),JSON_ARRAY(100.19673,16.751887),JSON_ARRAY(100.196232,16.751636),JSON_ARRAY(100.197556,16.748383),JSON_ARRAY(100.197863,16.747635),JSON_ARRAY(100.199284,16.74451),JSON_ARRAY(100.197306,16.742419),JSON_ARRAY(100.195476,16.74247),JSON_ARRAY(100.194883,16.742689)
      ))
    ),
    1
  )
ON DUPLICATE KEY UPDATE
  route_name = VALUES(route_name),
  description = VALUES(description),
  route_geojson = VALUES(route_geojson),
  is_active = VALUES(is_active);

SELECT 'Tha Pho pilot waste routes loaded successfully' AS seed_status;
