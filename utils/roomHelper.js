// Helper function to populate building information in room
const populateBuildingInRoom = (room) => {
  if (!room) return null;

  const building = room.building ? {
    name: room.building,
    title_vn: room.building_name_vn || room.building_name,
    title_en: room.building_name_en,
    short_title: room.building_short_title,
    campus_id: room.campus_id
  } : null;

  return {
    ...room.toObject ? room.toObject() : room,
    building: building
  };
};

// Common populate fields for room with building information (MUST include _id for frontend reference)
const ROOM_POPULATE_FIELDS = '_id name room_number building floor block status building_name building_name_vn building_name_en building_short_title campus_id short_title frappeRoomId';

module.exports = {
  populateBuildingInRoom,
  ROOM_POPULATE_FIELDS
};
