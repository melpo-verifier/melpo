module.exports = (sequelize, DataTypes) => {
    return sequelize.define('userbilling', {
        user_id: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        custom_bot_credits: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        has_active_subscription: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        subscription_tier: {
            type: DataTypes.STRING,
            defaultValue: 'normal',
        },
        processed_kofi_message_ids: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
        processed_entitlement_ids: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: [],
        },
    })
};
