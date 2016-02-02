/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014-2016, Tidepool Project
 *
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 *
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

import _ from 'lodash';
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import bows from '../bows.js';

import config from '../config.js';

import carelink from '../core/carelink.js';
import device from '../core/device.js';
import localStore from '../core/localStore.js';

import actions from '../redux/actions/';
const asyncActions = actions.asyncActions;
const syncActions = actions.syncActions;

import * as actionTypes from '../redux/constants/actionTypes';
import * as actionSources from '../redux/constants/actionSources';
import { pages, urls } from '../redux/constants/otherConstants';

import DeviceSelection from '../components/DeviceSelection';
import Loading from '../components/Loading';
import Login from '../components/Login';
import LoggedInAs from '../components/LoggedInAs';
import TimezoneDropdown from '../components/TimezoneDropdown';
import UploadList from '../components/UploadList';
import UpdatePlease from '../components/UpdatePlease';
import UserDropdown from '../components/UserDropdown';
import VersionCheckError from '../components/VersionCheckError';
import ViewDataLink from '../components/ViewDataLink';

export default class App extends Component {
  static propTypes = {
    api: PropTypes.func.isRequired
  };

  constructor(props) {
    super(props);
    this.log = bows('App');
    this.handleClickChooseDevices = this.handleClickChooseDevices.bind(this);
    this.handleDismissDropdown = this.handleDismissDropdown.bind(this);
    this.props.async.doAppInit(config, {
      api: props.api,
      carelink,
      device,
      localStore,
      log: this.log
    });
    this.props.async.doVersionCheck();
  }

  render() {
    const { isLoggedIn, page } = this.props;
    return (
      <div className={'App App--' + page.toLowerCase()} onClick={this.handleDismissDropdown}>
        <div className="App-header">{this.renderHeader()}</div>
        <div className="App-page">{this.renderPage()}</div>
        <div className="App-footer">{this.renderFooter()}</div>
        {/* VersionCheck as overlay */}
        {this.renderVersionCheck()}
      </div>
    );
  }

  handleClickChooseDevices() {
    const { setPage, toggleDropdown } = this.props.sync;
    // ensure dropdown closes after click
    setPage(pages.SETTINGS, true);
    toggleDropdown(true, actionSources.UNDER_THE_HOOD);
  }

  handleDismissDropdown() {
    const { dropdown } = this.props;
    // only toggle the dropdown by clicking elsewhere if it's open
    if (dropdown === true) {
      this.props.sync.toggleDropdown(dropdown);
    }
  }

  renderHeader() {
    const { dropdown, isLoggedIn, page, url, users } = this.props;
    if (page === pages.LOADING) {
      return null;
    }

    if (!isLoggedIn) {
      return (
        <div className="App-signup">
          <a  href={url.signUp} target="_blank">
            <i className="icon-add"> Sign up</i></a>
        </div>
      );
    }

    return (
      <LoggedInAs
        dropMenu={dropdown}
        user={users[users.loggedInUser]}
        onClicked={this.props.sync.toggleDropdown.bind(this, this.props.dropdown)}
        onChooseDevices={this.handleClickChooseDevices}
        onLogout={this.props.async.doLogout} />
    );
  }

  renderPage() {
    const { page, showingUserSelectionDropdown, unsupported, users } = this.props;

    let userDropdown = showingUserSelectionDropdown ?
      this.renderUserDropdown() : null;

    if (page === pages.LOADING) {
      return (<Loading />);
    } else if (page === pages.LOGIN) {
      return (
        <Login 
          disabled={Boolean(unsupported)}
          errorMessage={users.errorMessage || null}
          forgotPasswordUrl={this.props.url.forgotPassword}
          isFetching={users.isFetching}
          onLogin={this.props.async.doLogin} />
        );
    } else if (page === pages.MAIN) {
      const viewDataLink = _.get(this.props, ['url', 'viewDataLink'], '');
      return (
        <div>
          {userDropdown}
          <UploadList
            disabled={Boolean(unsupported)}
            targetId={users.uploadTargetUser}
            uploads={this.props.activeUploads}
            userDropdownShowing={showingUserSelectionDropdown}
            onReset={this.props.sync.resetUpload}
            onUpload={this.props.async.doUpload}
            readFile={this.props.async.readFile}
            toggleErrorDetails={this.props.sync.toggleErrorDetails} />
          <ViewDataLink
            href={viewDataLink}
            onViewClicked={this.props.sync.clickGoToBlip} />
        </div>
      );
    } else if (page === pages.SETTINGS) {
      let timezoneDropdown = this.renderTimezoneDropdown();
      return (
        <div>
          {userDropdown}
          {timezoneDropdown}
          <DeviceSelection
            disabled={Boolean(unsupported)}
            devices={this.props.devices}
            os={this.props.os}
            targetDevices={this.props.selectedTargetDevices}
            targetId={users.uploadTargetUser}
            timezoneIsSelected={Boolean(this.props.selectedTimezone)}
            userDropdownShowing={showingUserSelectionDropdown}
            userIsSelected={users.uploadTargetUser !== null}
            addDevice={this.props.sync.addTargetDevice}
            removeDevice={this.props.sync.removeTargetDevice}
            onDone={this.props.async.putTargetsInStorage} />
        </div>
      );
    } else {
      throw new Error('Unrecognized page!');
    }
  }

  renderFooter() {
    const { version } = this.props;
    return (
      <div>
        <div className="mailto">
          <a href="mailto:support@tidepool.org?Subject=Feedback on Blip" target="mailto">Send us feedback</a>
        </div>
        <div className="App-footer-version">{`v${version} beta`}</div>
      </div>
    );
  }

  renderTimezoneDropdown() {
    const { users } = this.props;
    return (
      <TimezoneDropdown
        onTimezoneChange={this.props.sync.setTargetTimezone}
        selectorLabel={'Choose timezone'}
        targetId={users.uploadTargetUser || null}
        targetTimezone={this.props.selectedTimezone} />
    );
  }

  renderUserDropdown() {
    const { page, users } = this.props;
    return (
      <UserDropdown
        page={page}
        onGroupChange={this.props.async.setUploadTargetUserAndMaybeRedirect}
        users={users}
        isUploadInProgress={this.props.uploads.uploadInProgress}
        targetId={users.uploadTargetUser} />
    );
  }

  renderVersionCheck() {
    const { unsupported } = this.props;
    if (unsupported === false) {
      return null;
    }
    if (unsupported instanceof Error) {
      return (
        <VersionCheckError errorMessage={unsupported.message || 'Unknown error'}/>
      );
    }
    if (unsupported === true) {
      return (
        <UpdatePlease knowledgeBaseLink={urls.HOW_TO_UPDATE_KB_ARTICLE} />
      );
    }
  }
}

App.propTypes = {
  page: React.PropTypes.string.isRequired
};

// wrap the component to inject dispatch and state into it
export default connect(
  (state) => {
    function getActiveUploads(state) {
      const { devices, uploads, users } = state;
      const uploadTargetUser = users.uploadTargetUser;
      if (uploadTargetUser === null) {
        return [];
      }
      let activeUploads = [];
      const targetUsersUploads = _.get(uploads, users.uploadTargetUser, []);
      _.map(Object.keys(targetUsersUploads), (deviceKey) => {
        const upload = uploads[users.uploadTargetUser][deviceKey];
        const device = _.pick(devices[deviceKey], ['instructions', 'key', 'name', 'source']);
        const progress = upload.uploading ? {progress: _.get(uploads, ['uploadInProgress', 'progress'], null)} :
          (upload.successful ? {progress: {percentage: 100}} : {});
        activeUploads.push(_.assign({}, device, upload, progress));
      });
      return activeUploads;
    }
    function hasSomeoneLoggedIn(state) {
      return !_.includes([pages.LOADING, pages.LOGIN], state.page);
    }
    function getPotentialUploadsForUploadTargetUser(state) {
      return Object.keys(
        _.get(state, ['uploads', state.users.uploadTargetUser], {})
      );
    }
    function getSelectedTargetDevices(state) {
      return _.get(
        state.users[state.users.uploadTargetUser],
        ['targets', 'devices'],
        // fall back to the targets stored under 'noUserSelected', if any
        _.get(state.users['noUserSelected'], ['targets', 'devices'], [])
      );
    }
    function getSelectedTimezone(state) {
      return _.get(
        state.users[state.users.uploadTargetUser],
        ['targets', 'timezone'],
        // fall back to the timezone stored under 'noUserSelected', if any
        _.get(state.users['noUserSelected'], ['targets', 'timezone'], null)
      );
    }
    function shouldShowUserSelectionDropdown(state) {
      return !_.isEmpty(state.users.targetsForUpload) &&
        state.users.targetsForUpload.length > 1;
    }
    return {
      // plain state
      devices: state.devices,
      dropdown: state.dropdown,
      os: state.os,
      page: state.page,
      version: state.version,
      unsupported: state.unsupported,
      uploads: state.uploads,
      url: state.url,
      users: state.users,
      // derived state
      activeUploads: getActiveUploads(state),
      isLoggedIn: hasSomeoneLoggedIn(state),
      potentialUploads: getPotentialUploadsForUploadTargetUser(state),
      selectedTargetDevices: getSelectedTargetDevices(state),
      selectedTimezone: getSelectedTimezone(state),
      showingUserSelectionDropdown: shouldShowUserSelectionDropdown(state)
    };
  },
  (dispatch) => {
    return {
      async: bindActionCreators(asyncActions, dispatch),
      sync: bindActionCreators(syncActions, dispatch)
    };
  }
)(App);