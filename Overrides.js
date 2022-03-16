Ext.override(Rally.ui.gridboard.Export, {
    // Override to also look at the cmp initial config storeConfig value
    _getScopeParams: function(cmp) {
        var context = (cmp.store && cmp.store.context) ||
            (cmp.initialConfig && cmp.initialConfig.storeConfig && cmp.initialConfig.storeConfig.context) ||
            cmp.getContext().getDataContext();

        return {
            workspace: context.workspace,
            project: context.project,
            projectScopeDown: context.projectScopeDown,
            projectScopeUp: context.projectScopeUp
        };
    }
});
