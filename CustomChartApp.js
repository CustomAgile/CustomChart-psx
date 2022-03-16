Ext.define('CustomChartApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    layout: {
        type: 'vbox',
        align: 'stretch'
    },

    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }, {
        id: 'grid-area',
        xtype: 'container',
        flex: 1,
        type: 'vbox',
        align: 'stretch'
    }],
    config: {
        defaultSettings: {
            types: 'Defect',
            chartType: 'piechart',
            aggregationField: 'State',
            aggregationType: 'count',
            bucketBy: '',
            stackField: '',
            query: ''
        }
    },

    launch: function() {
        if (!this.getSetting('types')) {
            this.fireEvent('appsettingsneeded'); //todo: does this work?
        }
        else {
            this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
                ptype: 'UtilsAncestorPiAppFilter',
                pluginId: 'ancestorFilterPlugin',
                settingsConfig: {
                    //labelWidth: 150,
                    //margin: 10
                },
                listeners: {
                    scope: this,
                    ready: function(plugin) {
                        Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                            scope: this,
                            success: function(portfolioItemTypes) {
                                this.portfolioItemTypes = portfolioItemTypes;
                                return Rally.data.wsapi.ModelFactory.getModels({
                                    types: this._getTypesSetting()
                                })
                            }
                        }).then({
                            success: this._onModelsLoaded,
                            scope: this
                        }).then({
                            scope: this,
                            success: function() {
                                plugin.addListener({
                                    scope: this,
                                    select: function() {
                                        this._addChart();
                                    }
                                });
                                this._addChart();
                            }
                        })
                    },
                }
            });
            this.addPlugin(this.ancestorFilterPlugin);
        }
    },

    // Usual monkey business to size gridboards
    onResize: function() {
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    searchAllProjects: function() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getSettingsFields: function() {
        return Settings.getSettingsFields({
            context: this.getContext()
        });
    },

    _shouldLoadAllowedStackValues: function(stackingField) {
        var hasAllowedValues = stackingField && stackingField.hasAllowedValues(),
            shouldLoadAllowedValues = hasAllowedValues && (
                _.contains(['state', 'rating', 'string'], stackingField.getType()) ||
                stackingField.getAllowedValueType() === 'state' ||
                stackingField.getAllowedValueType() === 'flowstate'
            );
        return shouldLoadAllowedValues;
    },

    _onModelsLoaded: function(models) {
        var deferred = Ext.create('Deft.Deferred');
        var result = deferred.promise;

        this.models = _.values(models);
        var model = this.models[0],
            stackingSetting = this._getStackingSetting(),
            stackingField = stackingSetting && model.getField(stackingSetting);

        if (this._shouldLoadAllowedStackValues(stackingField)) {
            result = stackingField.getAllowedValueStore().load().then({
                success: function(records) {
                    this.stackValues = _.invoke(records, 'get', 'StringValue');
                },
                scope: this
            });
        }
        else {
            deferred.resolve();
        }
        return result;
    },

    _addChart: function() {
        // If there is a current chart store, force it to stop loading pages
        // Note that recreating the grid will then create a new chart store with
        // the same store ID.
        var chartStore = Ext.getStore('chartStore');
        if (chartStore) {
            chartStore.cancelLoad();
        }

        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var context = this.getContext();
        var dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var whiteListFields = ['Milestones', 'Tags'],
            modelNames = _.pluck(this.models, 'typePath'),
            gridBoardConfig = {
                xtype: 'rallygridboard',
                toggleState: 'chart',
                height: gridArea.getHeight(),
                chartConfig: this._getChartConfig(),
                plugins: [{
                        ptype: 'rallygridboardinlinefiltercontrol',
                        showInChartMode: true,
                        inlineFilterButtonConfig: {
                            stateful: true,
                            stateId: context.getScopedStateId('filters'),
                            filterChildren: true,
                            modelNames: modelNames,
                            inlineFilterPanelConfig: {
                                quickFilterPanelConfig: {
                                    portfolioItemTypes: this.portfolioItemTypes,
                                    modelName: modelNames[0],
                                    defaultFields: this._getQuickFilters(),
                                    addQuickFilterConfig: {
                                        whiteListFields: whiteListFields
                                    }
                                },
                                advancedFilterPanelConfig: {
                                    advancedFilterRowsConfig: {
                                        propertyFieldConfig: {
                                            whiteListFields: whiteListFields
                                        }
                                    }
                                }
                            }
                        }
                    },
                    {
                        ptype: 'rallygridboardactionsmenu',
                        menuItems: [{
                            text: 'Export to CSV...',
                            handler: function() {
                                window.location = Rally.ui.gridboard.Export.buildCsvExportUrl(this.down('rallygridboard').getGridOrBoard());
                            },
                            scope: this
                        }],
                        buttonConfig: {
                            iconCls: 'icon-export',
                            toolTipConfig: {
                                html: 'Export',
                                anchor: 'top',
                                hideDelay: 0
                            }
                        }
                    }
                ],
                context: context,
                modelNames: modelNames,
                storeConfig: {
                    filters: this._getFilters(),
                    context: dataContext
                }
            };

        this.gridboard = gridArea.add(gridBoardConfig);
    },

    _getQuickFilters: function() {
        var quickFilters = ['Owner', 'State', 'ScheduleState'],
            model = this.models[0];
        if (this.models.length > 1) {
            quickFilters.push('ModelType');
        }

        return _.filter(quickFilters, function(quickFilter) {
            return model.hasField(quickFilter);
        });
    },

    _getTypesSetting: function() {
        return this.getSetting('types').split(',');
    },

    _getStackingSetting: function() {
        var chartType = this.getSetting('chartType');
        return chartType !== 'piechart' ? this.getSetting('stackField') : null;
    },

    _getChartConfig: function() {
        var chartType = this.getSetting('chartType'),
            stackField = this._getStackingSetting(),
            stackValues = this.stackValues,
            model = this.models[0],
            config = {
                xtype: chartType,
                enableStacking: !!stackField,
                chartColors: [
                    "#FF8200", // $orange
                    "#F6A900", // $gold
                    "#FAD200", // $yellow
                    "#8DC63F", // $lime
                    "#1E7C00", // $green_dk
                    "#337EC6", // $blue_link
                    "#005EB8", // $blue
                    "#7832A5", // $purple,
                    "#DA1884", // $pink,
                    "#C0C0C0" // $grey4
                ],
                storeConfig: {
                    storeId: 'chartStore',
                    context: this.getContext().getDataContext(),
                    //TODO: can we do summary fetch here and not limit infinity?
                    //we'll have to also make sure the fetch is correct for export somehow...
                    limit: Infinity,
                    fetch: this._getChartFetch(),
                    sorters: this._getChartSort(),
                    pageSize: 2000,
                },
                calculatorConfig: {
                    calculationType: this.getSetting('aggregationType'),
                    field: this.getSetting('aggregationField'),
                    stackField: stackField,
                    stackValues: stackValues,
                    bucketBy: chartType === 'piechart' ? null : this.getSetting('bucketBy')
                }
            };

        if (model.isArtifact()) {
            config.storeConfig.models = this._getTypesSetting();
            config.storeType = 'Rally.data.wsapi.artifact.Store';
        }
        else {
            config.storeConfig.model = model;
            config.storeType = 'Rally.data.wsapi.Store';
        }

        return config;
    },

    onTimeboxScopeChange: function() {
        this.callParent(arguments);
        this._addChart();
    },

    _getChartFetch: function() {
        var field = this.getSetting('aggregationField'),
            aggregationType = this.getSetting('aggregationType'),
            stackField = this._getStackingSetting(),
            fetch = ['FormattedID', 'Name', field];

        if (aggregationType !== 'count') {
            fetch.push(ChartUtils.getFieldForAggregationType(aggregationType));
        }
        if (stackField) {
            fetch.push(stackField);
        }

        if (_.contains(fetch, 'Iteration')) {
            fetch.push('StartDate');
        }
        if (_.contains(fetch, 'Release')) {
            fetch.push('ReleaseStartDate');
        }

        return fetch;
    },

    _getChartSort: function() {
        var model = this.models[0],
            field = model.getField(this.getSetting('aggregationField')),
            sorters = [];

        if (field && field.getType() !== 'collection' && field.sortable) {
            sorters.push({
                property: this.getSetting('aggregationField'),
                direction: 'ASC'
            });
        }

        return sorters;
    },

    _getFilters: function() {
        var queries = [],
            timeboxScope = this.getContext().getTimeboxScope();
        if (this.getSetting('query')) {
            var querySetting = this.getSetting('query').replace(/\{user\}/g, this.getContext().getUser()._ref);
            queries.push(Rally.data.QueryFilter.fromQueryString(querySetting));
        }
        if (timeboxScope && _.any(this.models, timeboxScope.isApplicable, timeboxScope)) {
            queries.push(timeboxScope.getQueryFilter());
        }
        var ancestorFilter = this.ancestorFilterPlugin.getFilterForType(this.models[0].typePath);
        if (ancestorFilter) {
            queries.push(ancestorFilter);
        }
        return queries;
    }
});
