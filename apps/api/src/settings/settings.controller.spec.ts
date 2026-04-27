import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let settingsService: {
    getAuditSettings: jest.Mock;
    updateAuditSettings: jest.Mock;
  };

  beforeEach(() => {
    settingsService = {
      getAuditSettings: jest.fn(),
      updateAuditSettings: jest.fn(),
    };

    controller = new SettingsController(settingsService as never);
  });

  it('returns audit setting from service', async () => {
    const user = {
      id: 'owner-1',
      role: 'OWNER',
      memberships: [],
    };

    settingsService.getAuditSettings.mockResolvedValue({
      enabled: true,
    });

    await expect(
      controller.getAuditSettings({ user } as never),
    ).resolves.toEqual({
      enabled: true,
    });
    expect(settingsService.getAuditSettings).toHaveBeenCalledWith(user);
  });

  it('updates audit setting through service', async () => {
    const user = {
      id: 'owner-1',
      role: 'OWNER',
      memberships: [],
    };

    settingsService.updateAuditSettings.mockResolvedValue({
      enabled: false,
    });

    await expect(
      controller.updateAuditSettings({ user } as never, { enabled: false }),
    ).resolves.toEqual({
      enabled: false,
    });
    expect(settingsService.updateAuditSettings).toHaveBeenCalledWith(
      user,
      false,
    );
  });
});
