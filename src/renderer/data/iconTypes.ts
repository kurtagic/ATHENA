// iconType -> PNG filename mapping
export const ICON_TYPE_MAP: Record<number, string> = {
  8:  'MapIconForwardBase1.png',
  11: 'MapIconHospital.png',
  12: 'MapIconFacilityVehicleFactory1.png',
  17: 'MapIconManufacturing.png',
  18: 'Shipyard.png',
  19: 'MapIconTechCenter.png',
  20: 'SalvageMapIcon.png',
  21: 'MapIconComponents.png',
  23: 'MapIconSulfur.png',
  26: 'MapIconsTrainingGround.png',
  27: 'MapIconsKeep.png',
  28: 'MapIconObservationTower.png',
  29: 'MapIconFort.png',
  32: 'MapIconSulfurMine.png',
  33: 'MapIconStorageFacility.png',
  34: 'MapIconFactory.png',
  35: 'MapIconSafehouse.png',
  37: 'MapIconRocketSite.png',
  38: 'MapIconScrapMine.png',
  39: 'MapIconConstructionYard.png',
  40: 'MapIconComponentMine.png',
  45: 'MapIconRelicBase.png',
  46: 'MapIconRelicBase.png',
  47: 'MapIconRelicBase.png',
  51: 'MapIconMassProductionFactory.png',
  52: 'MapIconSeaport.png',
  53: 'MapIconCoastalGun.png',
  54: 'MapIconSoulFactory.png',
  56: 'MapIconTownBaseTier1.png',
  57: 'MapIconTownBaseTier2.png',
  58: 'MapIconTownBaseTier3.png',
  59: 'MapIconStormcannon.png',
  60: 'MapIconIntelcenter.png',
  61: 'MapIconCoal.png',
  62: 'MapIconFacilityMineOilRig.png',
  70: 'MapIconRocketTarget.png',
  71: 'MapIconRocketGroundZero.png',
  72: 'MapIconRocketSiteWithRocket.png',
  75: 'MapIconFacilityMineOilRig.png',
  83: 'MapIconWeatherStation.png',
  84: 'MapIconMortarHouse.png',
  88: 'MapIconAircraftDepot.png',
  89: 'MapIconAircraftFactory.png',
  90: 'MapIconFortLargeRadar.png',
  91: 'MapIconAircraftRunwayT1.png',
  92: 'MapIconAircraftRunwayT2.png',
};

// Size categories
export const MAJOR_STRUCTURES = new Set([27, 29, 45, 46, 47, 56, 57, 58]);
export const RESOURCE_NODES = new Set([20, 21, 23, 61, 62, 75]);

// Conquerable structures that determine voronoi region ownership
// 27=Keep, 45/46/47=Relic Bases, 56/57/58=Town Halls T1/T2/T3
export const CONQUERABLE_STRUCTURES = new Set([27, 45, 46, 47, 56, 57, 58]);

// Team colors
export const TEAM_COLOR: Record<string, string> = {
  COLONIALS: '#6D7B34',
  WARDENS: '#516C96',
};
export const TEAM_NONE_COLOR = '#fff';
