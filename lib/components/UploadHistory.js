
/*
* == BSD2 LICENSE ==
* Copyright (c) 2016, Tidepool Project
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
import cx from 'classnames';

import Upload from './Upload';
import styles from '../../styles/components/DeviceSelection.module.less';
// import styles from '../../styles/components/UploadHistory.module.less';

export default class UploadHistory extends Component {
  static propTypes = {
    uploadHistory: PropTypes.array.isRequired,
    onDoneClicked: PropTypes.func.isRequired
  };

  constructor(props) {
    super(props);
  }

  //TODO: Styling is not good at all. Need to make it actually styly.
  render() {
    const uploadListClasses = cx({
      [styles.onlyme]: !this.props.userDropdownShowing,
      [styles.selectuser]: this.props.userDropdownShowing,
      [styles.profileError]: this.props.updateProfileErrorMessage
    });

    const { uploadHistory, onDoneClicked } = this.props;
    const uploadList = _.sortByOrder(uploadHistory, 'time', 'desc');

    const items = _.map(uploadList, (upload) => {
      return (
        <tr key={upload.id} className={styles.item}>
          <td>{upload.deviceModel} ({upload.deviceManufacturers.join(', ')} )</td>
          <td>{upload.time}</td>
        </tr>
      );
    });

    const empty = <p>Once you have completed uploads they will be displayed here.</p>;

    const uploadTable = (
      <table>
        <thead>
          <tr><th>Device</th><th>Date</th></tr>
        </thead>
        <tbody>
          {items}
        </tbody>
      </table>
    );

    return (
      <div className={styles.main}>
        <h3 className={styles.headline}>Previous Uploads</h3>
        <div>
          {uploadHistory.length ? uploadTable : empty }
        </div>
        <div className={styles.buttonWrap}>
          <button
            type="button"
            className={styles.button}
            onClick={onDoneClicked }
          >
            Done
          </button>
        </div>
      </div>
    );
  }
}
